/**
 * Port helpers shared by the worktree dev scripts. `convex dev` requires both
 * of its ports free (it does not reattach), so anything that boots a local
 * backend must be able to clear leftovers from a previous run of the same
 * worktree first. Only processes that belong to this workflow are killed —
 * an unrecognised listener on a registered port is reported, not terminated.
 */
import { execFileSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const repoRoot = path.resolve(import.meta.dirname, "../..");

export function isPortFree(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(300);
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, "127.0.0.1");
  });
}

/**
 * True for processes this workflow may have left behind: Convex CLIs and local
 * backends, Next.js dev servers, or any process whose command line references
 * this repo. Anything else is someone else's service.
 */
function isOwnedProcess(pid) {
  let comm = "";
  let args = "";
  try {
    comm = execFileSync("ps", ["-p", String(pid), "-o", "comm="], { encoding: "utf8" }).trim();
    args = execFileSync("ps", ["-p", String(pid), "-o", "args="], { encoding: "utf8" }).trim();
  } catch {
    // Vanished between lsof and ps — nothing to decide.
    return null;
  }
  if (/convex|next/i.test(comm)) return true;
  if (/convex|next/i.test(args) || args.includes(repoRoot)) return true;
  return false;
}

/**
 * PIDs of this worktree's local backends still shutting down. A SIGTERMed
 * backend closes its port before it finishes flushing SQLite, so a port
 * reporting free is not enough — a new backend opening the same data file
 * mid-flush dies instantly.
 */
function lingeringBackendPids() {
  const pattern = `convex-local-backend .*${repoRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*\\.convex`;
  try {
    return execFileSync("pgrep", ["-f", pattern], { encoding: "utf8" }).trim();
  } catch {
    return ""; // pgrep exits 1 when nothing matches
  }
}

/**
 * Wait until something is listening on `port` (isPortFree goes false), or the
 * deadline passes. `convex env` subcommands spawn their own local backend when
 * none is running, so any env probing must wait for the `convex dev` backend
 * to bind first — otherwise the two race for the port and one dies with
 * EADDRINUSE.
 */
export async function waitForPortListening(port, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortFree(port))) return true;
    await delay(500);
  }
  return false;
}

/**
 * Kill the processes listening on `port` when they look like our own dev
 * leftovers; resolves true once the port is free AND any killed process has
 * fully exited. Returns false (without killing anything) when an
 * unrecognised process holds the port — the caller surfaces that as a
 * port-conflict error.
 */
export async function stopProcessesOnPort(port, { timeoutMs = 10_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let pids = "";
    try {
      pids = execFileSync("lsof", ["-t", "-iTCP:" + port, "-sTCP:LISTEN"], {
        encoding: "utf8",
      }).trim();
    } catch {
      pids = "";
    }
    if (!pids) {
      if (lingeringBackendPids()) {
        await delay(500);
        continue;
      }
      // Free port and no lingering backend — still give the previous process
      // a moment to finish releasing sockets and file locks.
      await delay(1500);
      return isPortFree(port);
    }
    const killPids = [];
    for (const pid of pids.split("\n")) {
      const owned = isOwnedProcess(pid.trim());
      if (owned === null) continue;
      if (owned) {
        killPids.push(pid.trim());
      } else {
        const comm = execFileSync("ps", ["-p", pid.trim(), "-o", "comm="], {
          encoding: "utf8",
        }).trim();
        console.warn(
          `ports: port ${port} is held by "${comm}" (pid ${pid.trim()}) — not an Arbor dev process; stop it manually`,
        );
        return false;
      }
    }
    for (const pid of killPids) {
      try {
        process.kill(Number(pid), "SIGTERM");
      } catch {
        // already gone
      }
    }
    await delay(500);
  }
  return isPortFree(port);
}
