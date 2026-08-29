#!/usr/bin/env node
/**
 * Worktrunk vs. local Convex per worktree, so multiple agents can work on
 * different worktrees in parallel without colliding on one backend.
 *
 *   trunk  — shared cloud dev deployment. packages/backend/.env.local is a
 *            symlink into .git/arbor-env/, so every worktree shares one DB
 *            and schema. Default for a fresh checkout; use when you want
 *            shared data.
 *   local  — isolated anonymous Convex backend bound to this worktree's own
 *            ports. .env.local files are real (per-worktree), so schema
 *            pushes and data never collide with the trunk or another
 *            worktree. This is the mode for parallel agent work.
 *
 * Ports are allocated once per worktree in .git/arbor-env/worktree-convex.json
 * (keyed by absolute worktree path) and reused across runs.
 *
 * Usage:
 *   node scripts/worktree-convex.mjs ensure  — restore this worktree's mode
 *   node scripts/worktree-convex.mjs local   — switch to isolated local Convex
 *   node scripts/worktree-convex.mjs trunk   — switch to shared trunk
 *   node scripts/worktree-convex.mjs status  — show current mode/ports/files
 *   node scripts/worktree-convex.mjs dev     — run `convex dev` in current mode
 *   node scripts/worktree-convex.mjs start   — local + boot + set deployment env
 */
import { execFileSync, execSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const BACKEND_ENV_LOCAL = "packages/backend/.env.local";
const WEB_ENV_LOCAL = "apps/web/.env.local";
const BASE_PORT = Number(process.env.CONVEX_LOCAL_BASE_PORT ?? 3210);
const STRIDE = 10;
const GENERATED_MARKER = "managed by scripts/worktree-convex.mjs";

function git(command, cwd = process.cwd()) {
  return execSync(command, { cwd, encoding: "utf8" }).trim();
}

const repoRoot = git("git rev-parse --show-toplevel");
const gitCommonDirRaw = git("git rev-parse --git-common-dir", repoRoot);
const gitCommonDir = path.isAbsolute(gitCommonDirRaw)
  ? gitCommonDirRaw
  : path.resolve(repoRoot, gitCommonDirRaw);
const sharedRoot = path.join(gitCommonDir, "arbor-env");
const registryFile = path.join(sharedRoot, "worktree-convex.json");
const lockFile = path.join(sharedRoot, ".worktree-convex.lock");
const backendDir = path.join(repoRoot, "packages/backend");
const convexBin = path.join(repoRoot, "node_modules", ".bin", "convex");

function readRegistry() {
  let raw;
  try {
    raw = fs.readFileSync(registryFile, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { worktrees: {} };
    throw new Error(
      `could not read the worktree-convex registry at ${registryFile}: ${
        error instanceof Error ? error.message : String(error)
      }\nFix or remove that file, then rerun \`pnpm worktree-convex ensure\`.`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `worktree-convex registry at ${registryFile} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }\nRestore or remove that file, then rerun \`pnpm worktree-convex ensure\`.`,
    );
  }
}

function writeRegistry(registry) {
  fs.mkdirSync(path.dirname(registryFile), { recursive: true });
  const tmp = `${registryFile}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(registry, null, 2)}\n`);
  fs.renameSync(tmp, registryFile);
}

async function withLock(fn) {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const start = Date.now();
  let fd = null;
  while (fd === null) {
    try {
      fd = fs.openSync(lockFile, "wx");
    } catch {
      if (Date.now() - start > 5000) {
        throw new Error("timed out waiting for the worktree-convex registry lock");
      }
      await delay(50);
    }
  }
  try {
    return await fn();
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lockFile);
  }
}

function lstatOrNull(file) {
  try {
    return fs.lstatSync(file);
  } catch {
    return null;
  }
}

function readEnvValue(file, key) {
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(`${key}=`)) continue;
    let value = trimmed.slice(key.length + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value || null;
  }
  return null;
}

/** True for real files this script wrote (local-mode templates). */
function isGeneratedByUs(file) {
  if (!fs.existsSync(file)) return false;
  return fs.readFileSync(file, "utf8").includes(GENERATED_MARKER);
}

/**
 * True for a deployment-selected cloud config (the kind `convex dev` writes for
 * the shared trunk). Anonymous local configs are per-worktree tool output and
 * are not trunk material.
 */
function isTrunkEnvLocal(file) {
  if (!fs.existsSync(file)) return false;
  const deployment = readEnvValue(file, "CONVEX_DEPLOYMENT");
  const url = readEnvValue(file, "CONVEX_URL") ?? readEnvValue(file, "CONVEX_CLOUD_URL");
  if (deployment && !deployment.startsWith("anonymous")) return true;
  return Boolean(url && url.includes(".convex.cloud"));
}

function isPortFree(port) {
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

async function allocatePorts(registry) {
  const claimed = new Set(
    Object.values(registry.worktrees).flatMap((w) => [w.cloudPort, w.sitePort]),
  );
  for (let cloud = BASE_PORT; cloud < 65535 - STRIDE; cloud += STRIDE) {
    const site = cloud + 1;
    if (claimed.has(cloud) || claimed.has(site)) continue;
    if (!(await isPortFree(cloud)) || !(await isPortFree(site))) continue;
    return { cloudPort: cloud, sitePort: site };
  }
  throw new Error(`no free Convex port pair found starting at ${BASE_PORT}`);
}

function writeBackendEnvLocal(ports) {
  removeEnvLocal(BACKEND_ENV_LOCAL, {
    preserve: isTrunkEnvLocal(path.join(repoRoot, BACKEND_ENV_LOCAL)),
  });
  const contents = [
    "# Isolated local Convex backend for this worktree (managed by scripts/worktree-convex.mjs).",
    "# The Convex CLI keeps CONVEX_URL / CONVEX_SITE_URL in sync on every `convex dev`.",
    `CONVEX_URL=http://127.0.0.1:${ports.cloudPort}`,
    `CONVEX_SITE_URL=http://127.0.0.1:${ports.sitePort}`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(repoRoot, BACKEND_ENV_LOCAL), contents);
}

function writeWebEnvLocal(ports) {
  removeEnvLocal(WEB_ENV_LOCAL);
  const contents = [
    "# Isolated local Convex backend for this worktree (managed by scripts/worktree-convex.mjs).",
    `NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:${ports.cloudPort}`,
    `NEXT_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:${ports.sitePort}`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(repoRoot, WEB_ENV_LOCAL), contents);
}

/**
 * Remove an .env.local path before it is replaced, without losing files this
 * script did not write. Symlinks and files we generated are deleted; an
 * unmanaged real file is moved aside to `<file>.worktree-convex.bak` unless
 * `preserve` is set (meaning its content already lives in the shared store).
 */
function removeEnvLocal(relativePath, { preserve = false } = {}) {
  const full = path.join(repoRoot, relativePath);
  const stat = lstatOrNull(full);
  if (!stat) return;
  if (stat.isSymbolicLink() || preserve || isGeneratedByUs(full)) {
    fs.unlinkSync(full);
    return;
  }
  const backup = `${full}.worktree-convex.bak`;
  if (fs.existsSync(backup)) fs.unlinkSync(backup);
  fs.renameSync(full, backup);
  console.warn(
    `worktree-convex: backed up unmanaged ${relativePath} → ${path.basename(backup)}`,
  );
}

function linkBackendEnvLocalToShared() {
  const sharedBackendEnvLocal = path.join(sharedRoot, BACKEND_ENV_LOCAL);
  removeEnvLocal(BACKEND_ENV_LOCAL, {
    preserve: isTrunkEnvLocal(path.join(repoRoot, BACKEND_ENV_LOCAL)),
  });
  fs.mkdirSync(path.dirname(path.join(repoRoot, BACKEND_ENV_LOCAL)), { recursive: true });
  fs.symlinkSync(sharedBackendEnvLocal, path.join(repoRoot, BACKEND_ENV_LOCAL));
}

/** Move a real trunk-config .env.local into the shared store so every worktree can use it. */
function promoteBackendEnvLocalToShared() {
  const sharedBackendEnvLocal = path.join(sharedRoot, BACKEND_ENV_LOCAL);
  if (fs.existsSync(sharedBackendEnvLocal)) return false;
  const localFile = path.join(repoRoot, BACKEND_ENV_LOCAL);
  const stat = lstatOrNull(localFile);
  if (!stat || stat.isSymbolicLink() || !isTrunkEnvLocal(localFile)) return false;
  fs.mkdirSync(path.dirname(sharedBackendEnvLocal), { recursive: true });
  fs.copyFileSync(localFile, sharedBackendEnvLocal);
  console.log(
    `worktree-convex: promoted ${BACKEND_ENV_LOCAL} into the shared store as the trunk deployment`,
  );
  return true;
}

async function switchLocal() {
  // A real cloud .env.local (written by `convex dev` before this script ran)
  // is the shared trunk deployment — keep it in the shared store so switching
  // back to trunk later can still link it.
  promoteBackendEnvLocalToShared();
  return withLock(async () => {
    const registry = readRegistry();
    let entry = registry.worktrees[repoRoot];
    if (!entry?.cloudPort || !entry?.sitePort) {
      entry = await allocatePorts(registry);
      registry.worktrees[repoRoot] = { mode: "local", ...entry };
      writeRegistry(registry);
    }
    const ports = { cloudPort: entry.cloudPort, sitePort: entry.sitePort };
    writeBackendEnvLocal(ports);
    writeWebEnvLocal(ports);
    console.log(
      `worktree-convex: local mode — isolated backend @ http://127.0.0.1:${ports.cloudPort} (HTTP actions http://127.0.0.1:${ports.sitePort})`,
    );
    return ports;
  });
}

async function switchTrunk() {
  promoteBackendEnvLocalToShared();
  linkBackendEnvLocalToShared();
  removeEnvLocal(WEB_ENV_LOCAL);
  await withLock(() => {
    const registry = readRegistry();
    registry.worktrees[repoRoot] = { mode: "trunk" };
    writeRegistry(registry);
  });
  if (fs.existsSync(path.join(sharedRoot, BACKEND_ENV_LOCAL))) {
    console.log("worktree-convex: trunk mode — shared cloud dev deployment");
  } else {
    console.warn(
      `worktree-convex: trunk mode set, but the shared ${BACKEND_ENV_LOCAL} does not exist yet.\n` +
        "Run `pnpm dev:backend` once in any worktree to provision the shared trunk deployment.",
    );
  }
}

async function ensure() {
  const registry = readRegistry();
  const entry = registry.worktrees[repoRoot];
  if (entry?.mode === "local" && entry.cloudPort && entry.sitePort) {
    writeBackendEnvLocal({ cloudPort: entry.cloudPort, sitePort: entry.sitePort });
    writeWebEnvLocal({ cloudPort: entry.cloudPort, sitePort: entry.sitePort });
    console.log(`worktree-convex: restored local mode @ :${entry.cloudPort}`);
    return;
  }

  const backendEnvLocal = path.join(repoRoot, BACKEND_ENV_LOCAL);
  const stat = lstatOrNull(backendEnvLocal);
  if (stat?.isSymbolicLink()) return; // already trunk-linked
  if (stat?.isFile()) {
    if (isTrunkEnvLocal(backendEnvLocal)) {
      promoteBackendEnvLocalToShared();
      linkBackendEnvLocalToShared();
      console.log("worktree-convex: linked shared trunk .env.local");
    }
    return;
  }
  if (fs.existsSync(path.join(sharedRoot, BACKEND_ENV_LOCAL))) {
    linkBackendEnvLocalToShared();
    console.log("worktree-convex: linked shared trunk .env.local");
  }
}

function runConvexDev({ cloudPort, sitePort, anonymous }) {
  if (!fs.existsSync(convexBin)) {
    throw new Error(`Convex CLI not found at ${convexBin} — run \`pnpm install\` first.`);
  }
  const args =
    anonymous && cloudPort && sitePort
      ? [
          "dev",
          "--local-cloud-port",
          String(cloudPort),
          "--local-site-port",
          String(sitePort),
        ]
      : ["dev"];
  return spawn(convexBin, args, {
    cwd: backendDir,
    stdio: "inherit",
    env: anonymous
      ? { ...process.env, CONVEX_AGENT_MODE: "anonymous" }
      : process.env,
  });
}

function forwardSignals(child) {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
}

function waitForExit(child) {
  return new Promise((resolve) => child.on("exit", resolve));
}

async function bootstrapDeploymentEnv() {
  const convexEnv = { ...process.env, CONVEX_AGENT_MODE: "anonymous" };
  const deadline = Date.now() + 240_000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      execFileSync(convexBin, ["env", "list"], { cwd: backendDir, env: convexEnv, stdio: "pipe" });
      ready = true;
      break;
    } catch {
      await delay(2000);
    }
  }
  if (!ready) {
    console.warn("worktree-convex: local backend not ready yet — skipping deployment env bootstrap");
    return;
  }

  const secret = readEnvValue(path.join(backendDir, ".env"), "BETTER_AUTH_SECRET");
  const generated = !secret || secret.length < 32;
  const effective = generated ? crypto.randomBytes(32).toString("hex") : secret;
  for (const [key, value] of [
    ["BETTER_AUTH_SECRET", effective],
    ["SITE_URL", "http://localhost:3000"],
    ["EMAIL_TEST_MODE", "true"],
  ]) {
    try {
      execFileSync(convexBin, ["env", "set", key, value], {
        cwd: backendDir,
        env: convexEnv,
        stdio: "pipe",
      });
    } catch (error) {
      console.warn(
        `worktree-convex: could not set ${key} on the local deployment: ${
          error instanceof Error ? error.message.split("\n")[0] : String(error)
        }`,
      );
    }
  }
  if (generated) {
    console.warn(
      "worktree-convex: packages/backend/.env has no BETTER_AUTH_SECRET (min 32 chars); a random one was set on the deployment.\n" +
        "Set one there (shared by every worktree) so web auth and the local deployment agree.",
    );
  }
}

async function dev() {
  const registry = readRegistry();
  const entry = registry.worktrees[repoRoot];
  if (entry?.mode === "local" && entry.cloudPort && entry.sitePort) {
    console.log(`worktree-convex: local mode — isolated backend @ :${entry.cloudPort}`);
    const child = runConvexDev({
      cloudPort: entry.cloudPort,
      sitePort: entry.sitePort,
      anonymous: true,
    });
    forwardSignals(child);
    process.exit((await waitForExit(child)) ?? 0);
  }
  console.log("worktree-convex: trunk mode — shared cloud dev deployment");
  const child = runConvexDev({ anonymous: false });
  forwardSignals(child);
  process.exit((await waitForExit(child)) ?? 0);
}

async function start() {
  const ports = await switchLocal();
  if (!(await isPortFree(ports.cloudPort))) {
    console.log(
      "worktree-convex: a local backend is already running on this worktree's ports; `convex dev` will restart it",
    );
  }
  const child = runConvexDev({ ...ports, anonymous: true });
  forwardSignals(child);
  await bootstrapDeploymentEnv();
  process.exit((await waitForExit(child)) ?? 0);
}

function status() {
  const registry = readRegistry();
  const entry = registry.worktrees[repoRoot];
  const describe = (relativePath) => {
    const full = path.join(repoRoot, relativePath);
    const stat = lstatOrNull(full);
    if (!stat) return "missing";
    if (stat.isSymbolicLink()) {
      return fs.readlinkSync(full).startsWith(sharedRoot)
        ? "symlink → shared trunk"
        : `symlink → ${fs.readlinkSync(full)}`;
    }
    return "real file (per-worktree)";
  };
  console.log(`worktree-convex status for ${repoRoot}`);
  console.log(`  mode:               ${entry?.mode ?? "trunk (default)"}`);
  if (entry?.cloudPort) {
    console.log(`  cloud port:         ${entry.cloudPort}`);
    console.log(`  site port:          ${entry.sitePort}`);
  }
  console.log(`  backend .env.local: ${describe(BACKEND_ENV_LOCAL)}`);
  console.log(`  web .env.local:     ${describe(WEB_ENV_LOCAL)}`);
}

const handlers = { ensure, local: switchLocal, trunk: switchTrunk, start, dev, status };
const command = process.argv[2];
function fail(error) {
  console.error(`worktree-convex: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
if (command && handlers[command]) {
  try {
    const result = handlers[command]();
    if (result?.catch) result.catch(fail);
  } catch (error) {
    fail(error);
  }
} else {
  console.log("Usage: node scripts/worktree-convex.mjs <ensure|local|trunk|status|dev|start>");
  process.exit(1);
}