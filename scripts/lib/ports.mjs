/**
 * Port helpers shared by the worktree dev scripts. `convex dev` refuses to
 * start when its cloud port is already listening (it does not reattach), so
 * anything that boots a local backend must be able to clear leftovers from a
 * previous run of the same worktree first.
 */
import { execFileSync } from "node:child_process";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

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

/** Kill processes listening on `port`; resolves true once the port is free. */
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
      // A freed port does not mean the previous process finished releasing
      // its data dir / child sockets — give it a moment to settle.
      await delay(1000);
      return isPortFree(port);
    }
    for (const pid of pids.split("\n")) {
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
