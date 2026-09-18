#!/usr/bin/env node
// Warehouse print agent. Runs on the Raspberry Pi next to the printer: it
// claims rendered briefs from Convex and hands them to CUPS. Plain Node ESM so
// the OS image needs no build step. See packages/print-agent/install.sh.

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const execFileAsync = promisify(execFile);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

const CONVEX_URL = requireEnv("CONVEX_URL");
const TOKEN = requireEnv("PRINT_AGENT_TOKEN");
const QUEUE = process.env.PRINTER_QUEUE ?? "ou-wh1";
const POLL_MS = Number(process.env.PRINT_POLL_MS ?? 15_000);
const HEARTBEAT_MS = Number(process.env.PRINT_HEARTBEAT_MS ?? 60_000);

const heartbeat = makeFunctionReference("printAgent:heartbeat");
const claimNext = makeFunctionReference("printAgent:claimNext");
const complete = makeFunctionReference("printAgent:complete");
const fail = makeFunctionReference("printAgent:fail");

const client = new ConvexHttpClient(CONVEX_URL);

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

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
async function discoverIppUri() {
  const { stdout } = await execFileAsync("sh", [
    "-c",
    "lpinfo -v 2>/dev/null | awk '$1==\"network\" || $1==\"direct\" {print $2}' | grep -i '^ipp' | head -n1",
  ]);
  return stdout.trim() || null;
}

/**
 * Creates the CUPS queue on first run so the Pi is plug-and-print: the printer
 * isn't attached at image build time, so the queue can't be baked in.
 */
async function ensureQueue() {
  if (await hasQueue()) return "queue ready";
  const uri = await discoverIppUri();
  if (!uri) {
    throw new Error(
      "No IPP printer found. Is the printer plugged in and ipp-usb running? Check `lpinfo -v`.",
    );
  }
  await execFileAsync("lpadmin", ["-p", QUEUE, "-E", "-v", uri, "-m", "everywhere"]);
  log(`created CUPS queue "${QUEUE}" → ${uri}`);
  return `queue ready (${uri})`;
}

async function printJob(job) {
  const dir = await mkdtemp(join(tmpdir(), "arbor-brief-"));
  const file = join(dir, job.fileName || `${job.jobId}.pdf`);
  try {
    const response = await fetch(job.url);
    if (!response.ok) {
      throw new Error(`Brief download failed with HTTP ${response.status}.`);
    }
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    await execFileAsync("lp", ["-d", QUEUE, file]);
    await client.mutation(complete, { token: TOKEN, jobId: job.jobId });
    log(`printed ${job.fileName} (job ${job.jobId})`);
  } catch (error) {
    const text = message(error);
    log(`failed job ${job.jobId}: ${text}`);
    await client.mutation(fail, { token: TOKEN, jobId: job.jobId, error: text });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function beat(status, error) {
  try {
    await client.mutation(heartbeat, {
      token: TOKEN,
      queueName: QUEUE,
      status,
      error,
    });
  } catch (error) {
    log(`heartbeat failed: ${message(error)}`);
  }
}

let busy = false;

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const status = await ensureQueue();
    await beat(status, undefined);
    const job = await client.mutation(claimNext, { token: TOKEN, queueName: QUEUE });
    if (job) await printJob(job);
  } catch (error) {
    const text = message(error);
    log(`tick error: ${text}`);
    await beat("error", text);
  } finally {
    busy = false;
  }
}

async function main() {
  log(`starting — queue "${QUEUE}" at ${CONVEX_URL}`);
  await tick();
  setInterval(() => void tick(), POLL_MS);
  setInterval(() => void beat("idle"), HEARTBEAT_MS);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    log(`received ${signal}, exiting`);
    process.exit(0);
  });
}

main().catch((error) => {
  log(`fatal: ${message(error)}`);
  process.exit(1);
});
