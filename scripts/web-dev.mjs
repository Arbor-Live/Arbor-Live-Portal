#!/usr/bin/env node
/**
 * `next dev` on this worktree's own port so parallel worktrees never collide
 * on :3000. Port resolution order: PORT env (set by e2e-run.mjs), the web port
 * registered by scripts/worktree-convex.mjs, then the default 3000.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "apps/web");

function registryWebPort() {
  try {
    const gitCommonDirRaw = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    const gitCommonDir = path.isAbsolute(gitCommonDirRaw)
      ? gitCommonDirRaw
      : path.resolve(root, gitCommonDirRaw);
    const registry = JSON.parse(
      fs.readFileSync(path.join(gitCommonDir, "arbor-env", "worktree-convex.json"), "utf8"),
    );
    return registry.worktrees?.[root]?.webPort ?? null;
  } catch {
    return null;
  }
}

const port = Number(process.env.PORT) || registryWebPort() || 3000;
const child = spawn("pnpm", ["exec", "next", "dev", "-p", String(port)], {
  cwd: webDir,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 1));
