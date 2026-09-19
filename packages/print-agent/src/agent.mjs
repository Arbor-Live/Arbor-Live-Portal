#!/usr/bin/env node
// Warehouse print agent. Runs on the Raspberry Pi next to the printer: it
// claims rendered briefs from Convex and hands them to CUPS. Plain Node ESM so
// the OS image needs no build step. See packages/print-agent/install.sh.

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import WebSocket from "ws";

const execFileAsync = promisify(execFile);

/** @param {string} name */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

const CONVEX_URL = requireEnv("CONVEX_URL");
const TOKEN = requireEnv("PRINT_AGENT_TOKEN");
const QUEUE = process.env.PRINTER_QUEUE ?? "ou-wh1";
/** Idle liveness only; work is delivered by subscription, not a timer. */
const HEARTBEAT_MS = 10 * 60_000;
/** Retry CUPS queue setup this often while it is unavailable. */
const QUEUE_RETRY_MS = 60_000;
/** Resubscribe this soon after a subscription error. */
const SUBSCRIBE_RETRY_MS = 5_000;
/** Keep the Convex claim warm while a job downloads and prints. */
const CLAIM_RENEW_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const LP_TIMEOUT_MS = 120_000;

const heartbeat = /** @type {import("convex/server").FunctionReference<"mutation">} */ (
  makeFunctionReference("printAgent:heartbeat")
);
const claimNext = /** @type {import("convex/server").FunctionReference<"mutation">} */ (
  makeFunctionReference("printAgent:claimNext")
);
const complete = /** @type {import("convex/server").FunctionReference<"mutation">} */ (
  makeFunctionReference("printAgent:complete")
);
const fail = /** @type {import("convex/server").FunctionReference<"mutation">} */ (
  makeFunctionReference("printAgent:fail")
);
const renewClaim = /** @type {import("convex/server").FunctionReference<"mutation">} */ (
  makeFunctionReference("printAgent:renewClaim")
);
const pending = /** @type {import("convex/server").FunctionReference<"query">} */ (
  makeFunctionReference("printAgent:pending")
);

// A websocket subscription drives work; `ws` provides the constructor on Node
// versions without a global WebSocket.
const client = new ConvexClient(CONVEX_URL, {
  webSocketConstructor: /** @type {any} */ (WebSocket),
});

/** @param {unknown} error */
function message(error) {
  return error instanceof Error ? error.message : String(error);
}

/** @param {string} line */
function log(line) {
  console.log(`[arbor-print-agent] ${new Date().toISOString()} ${line}`);
}

async function hasQueue() {
  try {
    await execFileAsync("lpstat", ["-p", QUEUE]);
    return true;
  } catch {
    return false;
  }
}

/** First driverless IPP printer CUPS can see (network or USB via ipp-usb). */
/**
 * USB printers only — network printers are intentionally ignored.
 *
 * Prefer the ipp-usb loopback endpoint (IPP-over-USB). Avahi advertises the USB
 * device with the host's `.local` name (unresolvable without nss-mdns), so read
 * the advertised loopback address/port and talk to localhost directly. Fall
 * back to the legacy usb:// device if IPP-over-USB isn't in play.
 */
async function discoverUsbPrinterUri() {
  const { stdout } = await execFileAsync("sh", [
    "-c",
    "avahi-browse -ptr _ipp._tcp 2>/dev/null || true",
  ]);
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("=")) continue;
    const fields = line.split(";");
    const name = fields[3] ?? "";
    const address = fields[7];
    const port = fields[8];
    // " (USB)" is ipp-usb's suffix for a USB-attached device.
    if (!name.includes("(USB)")) continue;
    if (address !== "127.0.0.1" && address !== "::1") continue;
    if (!port) continue;
    return `ipp://${address}:${port}/ipp/print`;
  }

  const { stdout: usbOut } = await execFileAsync("sh", [
    "-c",
    "lpinfo -v 2>/dev/null | awk '$1==\"direct\" && $2 ~ /^usb:\\/\\// {print $2; exit}' || true",
  ]);
  return usbOut.trim() || null;
}

/**
 * Creates the CUPS queue on first run so the Pi is plug-and-print: the printer
 * isn't attached at image build time, so the queue can't be baked in.
 */
async function ensureQueue() {
  if (await hasQueue()) return "queue ready";
  const uri = await discoverUsbPrinterUri();
  if (!uri) {
    throw new Error(
      "No USB printer found. Is the printer plugged in? Check `ipp-usb check` and `lpinfo -v`.",
    );
  }
  try {
    await execFileAsync("lpadmin", ["-p", QUEUE, "-E", "-v", uri, "-m", "everywhere"]);
  } catch (error) {
    // lpadmin can print "lpadmin: Success" and still exit non-zero, so trust the
    // resulting queue state over its exit code.
    if (!(await hasQueue())) throw error;
    log(`lpadmin reported an error but the queue exists: ${message(error)}`);
    return `queue ready (${uri})`;
  }
  if (!(await hasQueue())) {
    throw new Error(`lpadmin finished but lpstat does not see queue "${QUEUE}".`);
  }
  log(`created CUPS queue "${QUEUE}" → ${uri}`);
  return `queue ready (${uri})`;
}

/** @param {number} ms */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @param {{ jobId: string, fileName?: string, claimToken: string }} job @param {string} text */
async function reportFailure(job, text) {
  try {
    await client.mutation(fail, {
      token: TOKEN,
      jobId: job.jobId,
      claimToken: job.claimToken,
      error: text,
    });
  } catch (error) {
    log(`could not report failure for ${job.jobId}: ${message(error)}`);
  }
}

/**
 * `lp` has already submitted the job, so a transient reporting blip must not
 * read as a failed print (that would cause a duplicate on the next claim).
 * Retry the report, then leave the job to the lease rather than failing it.
 *
 * @param {{ jobId: string, fileName?: string, claimToken: string }} job
 */
async function reportComplete(job) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await client.mutation(complete, {
        token: TOKEN,
        jobId: job.jobId,
        claimToken: job.claimToken,
      });
      return;
    } catch (error) {
      if (attempt === 2) {
        log(`printed ${job.fileName} but could not report completion: ${message(error)}`);
        return;
      }
      await delay(1_000 * (attempt + 1));
    }
  }
}

/** True when this job was already submitted to CUPS (e.g. a retry after a crash). */
/** @param {{ jobId: string }} job */
async function alreadyQueued(job) {
  // Bounded so a hung CUPS tool can't stall the agent. Throws on failure; the
  // caller treats that as "cannot confirm" and submits nothing.
  const { stdout } = await execFileAsync(
    "lpstat",
    ["-W", "not-completed", "-o", QUEUE],
    { timeout: DOWNLOAD_TIMEOUT_MS },
  );
  return stdout.includes(`arbor-${job.jobId}`);
}

/** @param {{ jobId: string, url: string, fileName?: string, claimToken: string }} job */
async function printJob(job) {
  const dir = await mkdtemp(join(tmpdir(), "arbor-brief-"));
  const file = join(dir, job.fileName || `${job.jobId}.pdf`);
  const renewTimer = setInterval(() => {
    client
      .mutation(renewClaim, {
        token: TOKEN,
        jobId: job.jobId,
        claimToken: job.claimToken,
      })
      .catch((error) => log(`could not renew claim for ${job.jobId}: ${message(error)}`));
  }, CLAIM_RENEW_MS);
  try {
    const response = await fetch(job.url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Brief download failed with HTTP ${response.status}.`);
    }
    await writeFile(file, Buffer.from(await response.arrayBuffer()));

    // The PDF may already be at CUPS if an earlier claim submitted it and then
    // died before reporting. Don't submit it twice; if we cannot confirm, leave
    // the job for the lease to reclaim rather than risk a duplicate print.
    let queued;
    try {
      queued = await alreadyQueued(job);
    } catch (error) {
      log(
        `could not check CUPS for ${job.jobId}: ${message(error)}; leaving it for the next claim`,
      );
      return;
    }

    if (queued) {
      log(`job ${job.jobId} is already queued at CUPS; skipping submission`);
    } else {
      try {
        // Title the CUPS job so a duplicate submission is identifiable at the sink.
        await execFileAsync("lp", ["-d", QUEUE, "-t", `arbor-${job.jobId}`, file], {
          timeout: LP_TIMEOUT_MS,
        });
      } catch (error) {
        const text = message(error);
        log(`failed job ${job.jobId}: ${text}`);
        await reportFailure(job, text);
        return;
      }
    }

    await reportComplete(job);
    log(`printed ${job.fileName} (job ${job.jobId})`);
  } catch (error) {
    const text = message(error);
    log(`failed job ${job.jobId}: ${text}`);
    await reportFailure(job, text);
  } finally {
    clearInterval(renewTimer);
    await rm(dir, { recursive: true, force: true });
  }
}

let queueStatus = "starting";

/** @param {string} [status] @param {string} [error] */
async function reportHeartbeat(status = queueStatus, error) {
  return await client.mutation(heartbeat, {
    token: TOKEN,
    queueName: QUEUE,
    status,
    error,
  });
}

let draining = false;

/**
 * Claims and prints until the queue is empty. A job insert pushes to the
 * subscription, so this runs on demand rather than on a timer.
 */
async function drain() {
  if (draining) return;
  draining = true;
  try {
    for (;;) {
      try {
        queueStatus = await ensureQueue();
      } catch (error) {
        const text = message(error);
        queueStatus = `error: ${text}`;
        log(`queue error: ${text}`);
        try {
          await reportHeartbeat(queueStatus, text);
        } catch (reportError) {
          log(`heartbeat failed: ${message(reportError)}`);
        }
        // Retry while the queue is broken; nothing can be claimed until it works.
        setTimeout(() => void drain(), QUEUE_RETRY_MS);
        return;
      }
      const job = await client.mutation(claimNext, {
        token: TOKEN,
        queueName: QUEUE,
        status: queueStatus,
      });
      if (!job) return;
      await printJob(job);
    }
  } catch (error) {
    log(`drain error: ${message(error)}`);
  } finally {
    draining = false;
  }
}

/** @type {string | null} */
let printerId = null;
/** @type {null | (() => void)} */
let unsubscribePending = null;
/** @type {string | null} */
let subscribedPrinterId = null;

/**
 * Subscribe once the agent knows which printer row it maps to. Subscribing by
 * printerId (not queueName) keeps the query reading only the jobs table, so the
 * periodic heartbeat writing the printer row doesn't re-run it.
 */
function ensureSubscription() {
  if (!printerId) return;
  if (unsubscribePending && subscribedPrinterId === printerId) return;
  if (unsubscribePending) {
    unsubscribePending();
    unsubscribePending = null;
  }
  subscribedPrinterId = printerId;
  unsubscribePending = client.onUpdate(
    pending,
    { token: TOKEN, printerId },
    (value) => {
      if (value) void drain();
    },
    (error) => {
      log(`subscription error: ${message(error)}`);
      // A failed subscription stops delivering; reset so we resubscribe, and
      // retry soon so we don't silently wait for the next heartbeat.
      unsubscribePending = null;
      subscribedPrinterId = null;
      setTimeout(() => {
        ensureSubscription();
        void drain();
      }, SUBSCRIBE_RETRY_MS);
    },
  );
}

/** Heartbeat to learn/refresh the printer row, then ensure the subscription. */
async function register() {
  const result = await reportHeartbeat();
  if (result && result.printerId) {
    printerId = result.printerId;
    ensureSubscription();
    void drain();
  }
}

function main() {
  log(`starting — queue "${QUEUE}" at ${CONVEX_URL}`);

  // Liveness only: a slow, jittered heartbeat so offline detection still works
  // when the device is idle. Decoupled from printing, so it can't add latency.
  const scheduleHeartbeat = () => {
    const wait = HEARTBEAT_MS * (0.85 + Math.random() * 0.3);
    setTimeout(() => {
      reportHeartbeat()
        .then((result) => {
          if (result && result.printerId) {
            printerId = result.printerId;
            ensureSubscription();
          }
        })
        .catch((error) => log(`heartbeat failed: ${message(error)}`))
        .finally(scheduleHeartbeat);
    }, wait);
  };
  scheduleHeartbeat();

  // Report online when the socket comes up and drain on (re)connect, in case
  // work landed while we were disconnected.
  let connected = false;
  client.subscribeToConnectionState((state) => {
    if (state.isWebSocketConnected && !connected) {
      connected = true;
      if (printerId) {
        void drain();
      } else {
        void register().catch((error) => log(`register failed: ${message(error)}`));
      }
    } else if (!state.isWebSocketConnected) {
      connected = false;
    }
  });

  void register().catch((error) => log(`register failed: ${message(error)}`));
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    log(`received ${signal}, exiting`);
    void client.close().finally(() => process.exit(0));
  });
}

try {
  main();
} catch (error) {
  log(`fatal: ${message(error)}`);
  process.exit(1);
}
