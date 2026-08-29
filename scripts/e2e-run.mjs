#!/usr/bin/env node
/**
 * Boots Convex + Next (or reuses an existing stack), then runs Playwright e2e.
 *
 * Env:
 *   E2E_SKIP_BOOT=1           — assume services already running on :3000
 *   E2E_BASE_URL              — default http://localhost:3000
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD / E2E_ADMIN_NAME
 *   CONVEX_AGENT_MODE         — default `anonymous` when booting (local + CI).
 *                               Anonymous `convex dev` always writes `.env.local`
 *                               (Convex `--env-file` cannot provision into an empty
 *                               file). Locally we stash any pre-existing cloud
 *                               `.env.local` → `.env.local.pre-e2e`, mirror the
 *                               anonymous config to `.env.e2e.local`, and restore
 *                               the stash on exit so day-to-day cloud Dev is intact.
 *                               Set `CONVEX_AGENT_MODE=cloud` or `E2E_USE_CLOUD_DEV=1`
 *                               to hit shared cloud Dev (counts against plan I/O).
 *   BETTER_AUTH_SECRET        — written to local .env and Convex deployment env
 */
import { spawn, execFileSync } from "child_process";
import { setTimeout as delay } from "timers/promises";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = path.join(root, "packages/backend");
const webDir = path.join(root, "apps/web");
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const skipBoot = process.env.E2E_SKIP_BOOT === "1";
const isCi = process.env.CI === "true" || process.env.CI === "1";

/**
 * Prefer anonymous local Convex when *booting* e2e so personal devices and CI
 * do not burn shared cloud Dev Database I/O (purgeBulk, email polling, etc.).
 *
 * `E2E_SKIP_BOOT=1` reuses whatever stack is already running — do not force
 * anonymous unless the caller sets CONVEX_AGENT_MODE=anonymous.
 */
function resolveAgentMode() {
  if (process.env.E2E_USE_CLOUD_DEV === "1") return undefined;
  const raw = process.env.CONVEX_AGENT_MODE?.trim().toLowerCase();
  if (raw === "cloud" || raw === "off" || raw === "0") return undefined;
  if (raw === "anonymous" || raw === "1" || raw === "true") return "anonymous";

  if (skipBoot) return undefined;

  // Default when booting: anonymous for both local and CI.
  return "anonymous";
}

const agentMode = resolveAgentMode();
const useAnonymous = agentMode === "anonymous";
/** Mirror of anonymous `.env.local` for docs / optional skip-boot reuse. */
const e2eEnvFile = path.join(backendDir, ".env.e2e.local");
const envLocalFile = path.join(backendDir, ".env.local");
const envLocalBackup = path.join(backendDir, ".env.local.pre-e2e");

/**
 * "dev" runs `next dev`; "prod" builds and runs `next start`.
 *
 * CI defaults to prod. Dev mode compiles routes on first request, and Convex's
 * 1s function-execution limit is wall-clock — so on a 4-vCPU runner where the
 * compiler, Convex, Chromium and the test runner share cores, first-visit
 * assertions time out queries that are not actually slow. Locally dev stays the
 * default so the boot stays fast.
 */
const webMode = (process.env.E2E_WEB_MODE ?? (isCi ? "prod" : "dev")).toLowerCase();

const children = [];
let restoredEnvLocal = false;

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...options.env },
    cwd: options.cwd ?? root,
    shell: false,
  });
  const prefix = options.prefix ?? command;
  child.stdout.on("data", (buf) => {
    for (const line of buf.toString().split("\n")) {
      if (line.trim()) console.log(`[${prefix}] ${line}`);
    }
  });
  child.stderr.on("data", (buf) => {
    for (const line of buf.toString().split("\n")) {
      if (line.trim()) console.error(`[${prefix}] ${line}`);
    }
  });
  children.push(child);
  return child;
}

/** Run a command to completion, streaming output; throws on a non-zero exit. */
async function runToCompletion(command, args, options = {}) {
  const child = run(command, args, options);
  const code = await new Promise((resolve) => child.on("exit", resolve));
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${code}`);
  }
}

async function waitForUrl(url, timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      // not up yet
    }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

/**
 * Stash cloud `.env.local` so anonymous `convex dev` can write the standard
 * path without permanently overwriting the developer deployment config.
 * Skipped on CI (no valuable pre-existing cloud config).
 */
function stashEnvLocalForAnonymous() {
  if (!useAnonymous || skipBoot || isCi) return;
  if (!fs.existsSync(envLocalFile)) return;
  // Already stashed earlier in this process — do not nest.
  if (fs.existsSync(envLocalBackup)) {
    console.log(
      `Keeping existing stash at ${path.relative(root, envLocalBackup)}`,
    );
    return;
  }
  fs.copyFileSync(envLocalFile, envLocalBackup);
  console.log(
    `Stashed ${path.relative(root, envLocalFile)} → ${path.relative(root, envLocalBackup)}`,
  );
}

function mirrorAnonymousEnvLocal() {
  if (!useAnonymous || !fs.existsSync(envLocalFile)) return;
  fs.copyFileSync(envLocalFile, e2eEnvFile);
}

function restoreEnvLocalFromStash() {
  if (restoredEnvLocal) return;
  if (!fs.existsSync(envLocalBackup)) return;
  try {
    fs.copyFileSync(envLocalBackup, envLocalFile);
    fs.unlinkSync(envLocalBackup);
    restoredEnvLocal = true;
    console.log(`Restored ${path.relative(root, envLocalFile)} from pre-e2e stash`);
  } catch (error) {
    console.warn(
      `Could not restore .env.local from stash: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function cleanup() {
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  restoreEnvLocalFromStash();
}

process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

function resolveBetterAuthSecret() {
  const existing = process.env.BETTER_AUTH_SECRET?.trim();
  if (existing && existing.length >= 32) return existing;

  // Prefer the worktree/shared backend .env so SKIP_BOOT runs don't rotate the
  // deployment secret out from under a already-running Next.js process.
  const envPath = path.join(backendDir, ".env");
  if (fs.existsSync(envPath)) {
    const match = fs
      .readFileSync(envPath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("BETTER_AUTH_SECRET="));
    if (match) {
      let value = match.slice("BETTER_AUTH_SECRET=".length).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value.length >= 32) return value;
    }
  }

  return crypto.randomBytes(32).toString("hex");
}

/**
 * Local `.env` must not contain placeholder CONVEX_* URLs — next.config keeps
 * the first value and would shadow `.env.local` from `convex dev`.
 */
function ensureLocalBackendEnvFile(secret) {
  const envPath = path.join(backendDir, ".env");
  const contents = [
    `BETTER_AUTH_SECRET=${secret}`,
    "SITE_URL=http://localhost:3000",
    "EMAIL_TEST_MODE=true",
    "",
  ].join("\n");

  if (isCi || !fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, contents);
    console.log(`Wrote ${path.relative(root, envPath)} for e2e`);
    return;
  }

  const current = fs.readFileSync(envPath, "utf8");
  if (/CONVEX_CLOUD_URL=https:\/\/your-convex-deployment/.test(current)) {
    const stripped = current
      .split("\n")
      .filter((line) => !/^\s*CONVEX_(CLOUD|SITE)_URL=/.test(line))
      .join("\n");
    fs.writeFileSync(envPath, stripped.endsWith("\n") ? stripped : `${stripped}\n`);
    console.log("Stripped placeholder CONVEX_* URLs from packages/backend/.env");
  }
}

function readEnvFileValue(filePath, keys) {
  if (!fs.existsSync(filePath)) return null;
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  for (const key of keys) {
    const match = lines
      .map((line) => line.trim())
      .find((line) => line.startsWith(`${key}=`));
    if (!match) continue;
    let value = match.slice(key.length + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) return value;
  }
  return null;
}

function envFileHasDeployment(filePath) {
  return Boolean(
    readEnvFileValue(filePath, [
      "CONVEX_DEPLOYMENT",
      "CONVEX_DEPLOY_KEY",
      "CONVEX_SELF_HOSTED_URL",
    ]),
  );
}

/**
 * Only pass `--env-file` when the file already has deployment credentials.
 * Convex refuses empty/placeholder env files (it cannot provision into them).
 * During a normal anonymous boot we leave this empty and use `.env.local`.
 */
function convexCliArgs(extra = []) {
  if (
    useAnonymous &&
    envFileHasDeployment(e2eEnvFile) &&
    // Prefer .env.e2e.local only for skip-boot anonymous reuse; during a live
    // boot `.env.local` is the active anonymous config.
    skipBoot
  ) {
    return ["--env-file", path.relative(backendDir, e2eEnvFile), ...extra];
  }
  return extra;
}

function convexEnv(extra = {}) {
  return {
    ...process.env,
    ...(agentMode ? { CONVEX_AGENT_MODE: agentMode } : {}),
    ...(useAnonymous ? { CONVEX_AGENT_MODE: "anonymous" } : {}),
    ...extra,
  };
}

function setConvexEnv(key, value) {
  execFileSync("pnpm", ["exec", "convex", "env", "set", ...convexCliArgs([key, value])], {
    cwd: backendDir,
    encoding: "utf8",
    env: convexEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * `convex env set` on a just-booted anonymous backend can race provisioning and
 * fail once even though the deployment is reachable. Retry transient failures
 * with a backoff instead of one-shot-and-move-on — a silently dropped env var
 * (E2E_HELPERS etc.) makes every e2e helper fail minutes later at boot time.
 */
async function setConvexEnvWithRetry(key, value, { attempts = 6, delayMs = 10_000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      setConvexEnv(key, value);
      console.log(`Set Convex env ${key}`);
      return;
    } catch (error) {
      const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
      if (attempt === attempts) {
        throw new Error(
          `Could not set Convex env ${key} after ${attempts} attempts: ${detail}`,
        );
      }
      console.warn(
        `Convex env set ${key} raced the backend (attempt ${attempt}/${attempts}): ${detail}; retrying in ${delayMs / 1000}s…`,
      );
      await delay(delayMs);
    }
  }
}

function resolveConvexDeploymentUrl() {
  const fromEnv =
    process.env.NEXT_PUBLIC_CONVEX_URL?.trim() ||
    process.env.CONVEX_URL?.trim() ||
    process.env.CONVEX_CLOUD_URL?.trim();
  if (fromEnv) return fromEnv;

  const keys = ["CONVEX_URL", "CONVEX_CLOUD_URL", "NEXT_PUBLIC_CONVEX_URL"];
  // Active boot writes anonymous into .env.local; mirror may lag by a moment.
  for (const file of [envLocalFile, e2eEnvFile, path.join(backendDir, ".env")]) {
    const value = readEnvFileValue(file, keys);
    if (value) return value;
  }
  return null;
}

function isLikelyCloudConvexUrl(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".convex.cloud") || host.endsWith(".convex.site");
  } catch {
    return /convex\.(cloud|site)/.test(url);
  }
}

function warnIfSkipBootHitsCloud() {
  const url = resolveConvexDeploymentUrl();
  if (isLikelyCloudConvexUrl(url)) {
    console.warn(
      [
        "",
        "WARNING: E2E_SKIP_BOOT=1 is targeting a cloud Convex deployment:",
        `  ${url}`,
        "E2E helpers (purgeBulk, email polling, seed prune) count against plan Database I/O.",
        "Prefer `pnpm test:e2e` (boots anonymous local Convex; restores cloud .env.local on exit).",
        "",
      ].join("\n"),
    );
  }
}

async function waitForConvexReady(timeoutMs = 240_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(envLocalFile) && envFileHasDeployment(envLocalFile)) {
      try {
        execFileSync("pnpm", ["exec", "convex", "env", "list", ...convexCliArgs()], {
          cwd: backendDir,
          env: convexEnv(),
          stdio: "pipe",
        });
        mirrorAnonymousEnvLocal();
        return;
      } catch {
        // deployment still provisioning / functions not pushed
      }
    }
    await delay(2000);
  }
  throw new Error(
    useAnonymous
      ? "Timed out waiting for anonymous Convex (.env.local) to become ready."
      : "Timed out waiting for Convex deployment to become ready.",
  );
}

async function ensureConvexDeploymentEnv(secret, { includeAuthSecret = true } = {}) {
  const pairs = [
    ...(includeAuthSecret ? [["BETTER_AUTH_SECRET", secret]] : []),
    ["SITE_URL", "http://localhost:3000"],
    ["EMAIL_TEST_MODE", "true"],
    ["E2E_HELPERS", "true"],
    ["E2E_EMAIL_MOCK", "true"],
  ];
  for (const [key, value] of pairs) {
    await setConvexEnvWithRetry(key, value);
  }
}

async function waitForE2eHelpersReady(timeoutMs = 300_000) {
  const start = Date.now();
  let lastError = "";
  while (Date.now() - start < timeoutMs) {
    try {
      execFileSync(
        "pnpm",
        [
          "exec",
          "convex",
          "run",
          ...convexCliArgs(["e2eHelpers:getLatestEmailNotification", "{}"]),
        ],
        {
          cwd: backendDir,
          env: convexEnv(),
          stdio: "pipe",
        },
      );
      console.log("e2eHelpers are deployed and callable");
      mirrorAnonymousEnvLocal();
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (error && typeof error === "object" && "stderr" in error) {
        const stderr = String(/** @type {{ stderr?: Buffer | string }} */ (error).stderr ?? "");
        if (stderr.trim()) lastError = stderr.trim().slice(-500);
      }
    }
    await delay(3000);
  }
  throw new Error(
    `Timed out waiting for e2eHelpers after Convex boot. Last error:\n${lastError}`,
  );
}

/**
 * Delete stale seeded events before the suite runs.
 *
 * Seeded events cluster on near-identical `startAt` values and several product
 * queries page with `.take(150)`/`.take(200)` — `listCrewedEventsInRange` is the
 * one that bites. Once enough runs accumulate on a shared deployment, a freshly
 * seeded event sorts past the cap and specs fail for reasons unrelated to the
 * code under test.
 *
 * Batched deliberately: the pruner reads each event's children, and one 200-row
 * pass already measured 3314 reads against Convex's 4096 limit.
 */
async function pruneStaleSeedData() {
  if (process.env.E2E_SKIP_PRUNE === "1") {
    console.log("E2E_SKIP_PRUNE=1 — leaving seeded data in place");
    return;
  }
  let deleted = 0;
  for (let pass = 0; pass < 20; pass += 1) {
    let result;
    try {
      const raw = execFileSync(
        "pnpm",
        [
          "exec",
          "convex",
          "run",
          ...convexCliArgs([
            "e2eHelpers:pruneE2eSeedData",
            JSON.stringify({ olderThanHours: 2, limit: 50 }),
          ]),
        ],
        { cwd: backendDir, encoding: "utf8", env: convexEnv(), stdio: ["ignore", "pipe", "pipe"] },
      );
      const match = raw.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : null;
    } catch (error) {
      // Never block the suite on housekeeping.
      console.warn(
        `Seed prune unavailable (continuing): ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
      );
      return;
    }
    if (!result?.deletedEvents) break;
    deleted += result.deletedEvents;
  }
  console.log(deleted ? `Pruned ${deleted} stale e2e events` : "No stale e2e events to prune");
}

/**
 * Delete stale stamped E2E users (invite-created accounts). Without this, every
 * run of `smoke/invite.spec.ts` leaves one more "E2E Crew"-named member on a
 * shared deployment; they eventually break name-keyed pickers (the mention menu
 * resolves `@Name` to every candidate with that name). Bounded like the seed
 * pruner: each pass reads the Better Auth user table and cascades its rows.
 */
async function pruneStaleE2eUsers() {
  if (process.env.E2E_SKIP_PRUNE === "1") {
    console.log("E2E_SKIP_PRUNE=1 — leaving users in place");
    return;
  }
  let deleted = 0;
  for (let pass = 0; pass < 20; pass += 1) {
    let result;
    try {
      const raw = execFileSync(
        "pnpm",
        [
          "exec",
          "convex",
          "run",
          ...convexCliArgs([
            "e2eHelpers:pruneStaleE2eUsers",
            JSON.stringify({ olderThanHours: 2, limit: 25 }),
          ]),
        ],
        { cwd: backendDir, encoding: "utf8", env: convexEnv(), stdio: ["ignore", "pipe", "pipe"] },
      );
      const match = raw.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : null;
    } catch (error) {
      // Never block the suite on housekeeping.
      console.warn(
        `User prune unavailable (continuing): ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
      );
      return;
    }
    if (!result?.deletedUsers) break;
    deleted += result.deletedUsers;
  }
  console.log(deleted ? `Pruned ${deleted} stale e2e users` : "No stale e2e users to prune");
}

/** Publish anonymous deployment URLs into the child process env for Next + Playwright. */
function anonymousPublicEnv() {
  if (!useAnonymous) return {};
  const url = resolveConvexDeploymentUrl();
  if (!url) return { CONVEX_AGENT_MODE: "anonymous" };
  const siteUrl = url.endsWith(".convex.cloud")
    ? url.replace(/\.convex\.cloud$/, ".convex.site")
    : deriveLocalSiteUrl(url);
  return {
    CONVEX_AGENT_MODE: "anonymous",
    CONVEX_URL: url,
    CONVEX_CLOUD_URL: url,
    NEXT_PUBLIC_CONVEX_URL: url,
    ...(siteUrl
      ? { CONVEX_SITE_URL: siteUrl, NEXT_PUBLIC_CONVEX_SITE_URL: siteUrl }
      : {}),
  };
}

/** For a 127.0.0.1/localhost backend, HTTP actions live on cloud port + 1. */
function deriveLocalSiteUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
      const port = Number(parsed.port);
      if (Number.isFinite(port) && port > 0) {
        parsed.port = String(port + 1);
        return parsed.toString().replace(/\/$/, "");
      }
    }
  } catch {
    // Fall through.
  }
  return undefined;
}

/**
 * If this worktree is in isolated "local" Convex mode (scripts/worktree-convex.mjs),
 * boot e2e against the worktree's own ports so runs never collide with another
 * worktree's local backend or with the shared trunk.
 */
function readWorktreeLocalPorts() {
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
    const entry = registry.worktrees?.[root];
    if (entry?.mode === "local" && entry.cloudPort && entry.sitePort) {
      return { cloudPort: entry.cloudPort, sitePort: entry.sitePort };
    }
  } catch {
    // Not in local mode or registry missing — fall back to Convex's default ports.
  }
  return null;
}

async function main() {
  const secret = resolveBetterAuthSecret();
  process.env.BETTER_AUTH_SECRET = secret;

  if (useAnonymous) {
    console.log(
      "E2E Convex mode: anonymous local (writes .env.local; restores cloud stash on exit)",
    );
  } else {
    console.log(
      "E2E Convex mode: cloud Dev (.env.local) — Database I/O counts against the team plan",
    );
  }

  if (!skipBoot) {
    ensureLocalBackendEnvFile(secret);
    stashEnvLocalForAnonymous();

    console.log(
      `Starting Convex…${agentMode ? ` (CONVEX_AGENT_MODE=${agentMode})` : ""}`,
    );
    // Anonymous provisions into the default `.env.local` path — `--env-file`
    // cannot be used to create a new deployment (Convex requires credentials
    // already present in that file).
    const devArgs = ["exec", "convex", "dev", "--typecheck", "disable"];
    if (useAnonymous) {
      const localPorts = readWorktreeLocalPorts();
      if (localPorts) {
        devArgs.push(
          "--local-cloud-port",
          String(localPorts.cloudPort),
          "--local-site-port",
          String(localPorts.sitePort),
        );
        console.log(
          `E2E Convex ports: this worktree is local mode — using :${localPorts.cloudPort}/:${localPorts.sitePort}`,
        );
      }
    }
    run("pnpm", devArgs, {
      cwd: backendDir,
      prefix: "convex",
      env: convexEnv(),
    });

    await waitForConvexReady();
    await ensureConvexDeploymentEnv(secret, { includeAuthSecret: true });
    // Env changes force a re-push; wait until helpers exist before starting web/tests.
    await waitForE2eHelpersReady();
    await pruneStaleSeedData();
    await pruneStaleE2eUsers();

    const publicEnv = anonymousPublicEnv();
    const webEnv = {
      ...process.env,
      ...publicEnv,
      BETTER_AUTH_SECRET: secret,
      SITE_URL: "http://localhost:3000",
    };

    if (webMode === "prod") {
      // Must build *after* Convex boots: `materialize-convex-public-env.mjs`
      // reads the deployment URL out of packages/backend/.env.local.
      console.log("Building Next.js (production)…");
      await runToCompletion("pnpm", ["build"], {
        cwd: webDir,
        prefix: "build",
        env: webEnv,
      });
      console.log("Starting Next.js (production)…");
      run("pnpm", ["start"], { cwd: webDir, prefix: "web", env: webEnv });
    } else {
      console.log("Starting Next.js (dev)…");
      run("pnpm", ["dev"], { cwd: webDir, prefix: "web", env: webEnv });
    }
  } else {
    console.log("E2E_SKIP_BOOT=1 — reusing existing stack");
    warnIfSkipBootHitsCloud();
    // Do not rotate BETTER_AUTH_SECRET on a shared cloud deployment — that
    // invalidates Better Auth JWKS and breaks /api/auth/convex/token.
    await ensureConvexDeploymentEnv(secret, { includeAuthSecret: false }).catch((error) => {
      console.warn(`Could not set Convex e2e env (continuing): ${error.message}`);
    });
    await waitForE2eHelpersReady().catch((error) => {
      console.warn(`e2eHelpers not ready (continuing): ${error.message}`);
    });
    await pruneStaleSeedData();
    await pruneStaleE2eUsers();
  }

  console.log(`Waiting for ${baseURL}…`);
  await waitForUrl(baseURL);

  const playwrightArgs = process.argv.slice(2).filter((arg) => arg !== "--");
  const child = spawn(
    "pnpm",
    ["exec", "playwright", "test", ...playwrightArgs],
    {
      cwd: webDir,
      stdio: "inherit",
      env: {
        ...process.env,
        ...anonymousPublicEnv(),
        E2E_BASE_URL: baseURL,
        BETTER_AUTH_SECRET: secret,
      },
    },
  );

  const code = await new Promise((resolve) => child.on("exit", resolve));
  cleanup();
  process.exit(code ?? 1);
}

/**
 * Exit code reserved for infra/boot failures (Convex binary download, build,
 * server startup) — distinct from Playwright's test-failure exit code 1 so CI
 * can retry only the retryable kind. Once Playwright has run, a non-zero shard
 * is a real failure.
 */
const EXIT_INFRA = 10;

main().catch((error) => {
  console.error(error);
  cleanup();
  process.exit(EXIT_INFRA);
});
