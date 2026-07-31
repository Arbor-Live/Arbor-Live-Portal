#!/usr/bin/env node
/**
 * Boots Convex + Next (or reuses an existing stack), then runs Playwright e2e.
 *
 * Env:
 *   E2E_SKIP_BOOT=1           — assume services already running on :3000
 *   E2E_BASE_URL              — default http://localhost:3000
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD / E2E_ADMIN_NAME
 *   CONVEX_AGENT_MODE         — default `anonymous` (local + CI). Local anonymous
 *                               uses packages/backend/.env.e2e.local so it does
 *                               not overwrite the developer cloud `.env.local`.
 *                               Set `CONVEX_AGENT_MODE=cloud` (or `E2E_USE_CLOUD_DEV=1`)
 *                               to deliberately hit a shared cloud Dev deployment
 *                               (counts against plan Database I/O).
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
 * `E2E_SKIP_BOOT=1` reuses whatever stack is already running — default to that
 * stack's `.env.local` unless the caller explicitly asks for anonymous
 * (`.env.e2e.local`).
 */
function resolveAgentMode() {
  if (process.env.E2E_USE_CLOUD_DEV === "1") return undefined;
  const raw = process.env.CONVEX_AGENT_MODE?.trim().toLowerCase();
  if (raw === "cloud" || raw === "off" || raw === "0") return undefined;
  if (raw === "anonymous" || raw === "1" || raw === "true") return "anonymous";

  if (skipBoot) {
    // Opt-in only: do not attach --env-file .env.e2e.local to a cloud stack.
    return undefined;
  }

  // Default when booting: anonymous for both local and CI.
  return "anonymous";
}

const agentMode = resolveAgentMode();
const useAnonymous = agentMode === "anonymous";
/** Isolated from developer cloud `.env.local` when running anonymous e2e. */
const e2eEnvFile = path.join(backendDir, ".env.e2e.local");
const e2eEnvFileRel = path.relative(backendDir, e2eEnvFile);

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

function cleanup() {
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
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

/**
 * `--env-file` requires the path to exist already. Seed a placeholder so the
 * first `convex dev` can write CONVEX_URL / CONVEX_DEPLOYMENT into it instead of
 * failing with "\.env.e2e.local: not found" and without touching cloud `.env.local`.
 */
function ensureAnonymousEnvFile() {
  if (!useAnonymous) return;
  if (fs.existsSync(e2eEnvFile)) return;
  fs.writeFileSync(
    e2eEnvFile,
    [
      "# Anonymous Convex deployment for Playwright e2e (`pnpm test:e2e`).",
      "# Managed by scripts/e2e-run.mjs — do not use for day-to-day `pnpm dev:backend`.",
      "",
    ].join("\n"),
  );
  console.log(`Created ${path.relative(root, e2eEnvFile)}`);
}

function convexCliArgs(extra = []) {
  if (useAnonymous) {
    ensureAnonymousEnvFile();
    return ["--env-file", e2eEnvFileRel, ...extra];
  }
  return extra;
}

function convexEnv(extra = {}) {
  return {
    ...process.env,
    ...(agentMode ? { CONVEX_AGENT_MODE: agentMode } : {}),
    // Helpers / Playwright resolve the anonymous URL from this file.
    ...(useAnonymous
      ? {
          E2E_CONVEX_ENV_FILE: e2eEnvFile,
          CONVEX_AGENT_MODE: "anonymous",
        }
      : {}),
    ...extra,
  };
}

function setConvexEnv(key, value) {
  execFileSync(
    "pnpm",
    ["exec", "convex", "env", "set", ...convexCliArgs([key, value])],
    {
      cwd: backendDir,
      encoding: "utf8",
      env: convexEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function resolveConvexDeploymentUrl() {
  const fromEnv =
    process.env.NEXT_PUBLIC_CONVEX_URL?.trim() ||
    process.env.CONVEX_URL?.trim() ||
    process.env.CONVEX_CLOUD_URL?.trim();
  if (fromEnv) return fromEnv;

  const keys = ["CONVEX_URL", "CONVEX_CLOUD_URL", "NEXT_PUBLIC_CONVEX_URL"];
  if (useAnonymous) {
    const fromE2e = readEnvFileValue(e2eEnvFile, keys);
    if (fromE2e) return fromE2e;
  }
  for (const file of [".env.local", ".env"]) {
    const value = readEnvFileValue(path.join(backendDir, file), keys);
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
        "Prefer `pnpm test:e2e` (boots anonymous local Convex into .env.e2e.local),",
        "or set CONVEX_AGENT_MODE=anonymous without SKIP_BOOT.",
        "",
      ].join("\n"),
    );
  }
}

async function waitForConvexReady(timeoutMs = 240_000) {
  const envLocal = useAnonymous ? e2eEnvFile : path.join(backendDir, ".env.local");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(envLocal)) {
      try {
        execFileSync("pnpm", ["exec", "convex", "env", "list", ...convexCliArgs()], {
          cwd: backendDir,
          env: convexEnv(),
          stdio: "pipe",
        });
        return;
      } catch {
        // deployment still provisioning / functions not pushed
      }
    }
    await delay(2000);
  }
  throw new Error(
    useAnonymous
      ? `Timed out waiting for anonymous Convex (.env.e2e.local) to become ready.`
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
    try {
      setConvexEnv(key, value);
      console.log(`Set Convex env ${key}`);
    } catch (error) {
      console.warn(`Could not set Convex env ${key}: ${error.message}`);
    }
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
  if (!url) return { E2E_CONVEX_ENV_FILE: e2eEnvFile, CONVEX_AGENT_MODE: "anonymous" };
  const siteUrl = url.endsWith(".convex.cloud")
    ? url.replace(/\.convex\.cloud$/, ".convex.site")
    : url.includes(":3210")
      ? url.replace(":3210", ":3211")
      : undefined;
  return {
    E2E_CONVEX_ENV_FILE: e2eEnvFile,
    CONVEX_AGENT_MODE: "anonymous",
    CONVEX_URL: url,
    CONVEX_CLOUD_URL: url,
    NEXT_PUBLIC_CONVEX_URL: url,
    ...(siteUrl
      ? { CONVEX_SITE_URL: siteUrl, NEXT_PUBLIC_CONVEX_SITE_URL: siteUrl }
      : {}),
  };
}

async function main() {
  const secret = resolveBetterAuthSecret();
  process.env.BETTER_AUTH_SECRET = secret;

  if (useAnonymous) {
    console.log(
      `E2E Convex mode: anonymous local (env file ${path.relative(root, e2eEnvFile)})`,
    );
  } else {
    console.log(
      "E2E Convex mode: cloud Dev (.env.local) — Database I/O counts against the team plan",
    );
  }

  if (!skipBoot) {
    ensureLocalBackendEnvFile(secret);
    ensureAnonymousEnvFile();

    console.log(
      `Starting Convex…${agentMode ? ` (CONVEX_AGENT_MODE=${agentMode})` : ""}`,
    );
    run(
      "pnpm",
      ["exec", "convex", "dev", ...convexCliArgs(["--typecheck", "disable"])],
      {
        cwd: backendDir,
        prefix: "convex",
        env: convexEnv(),
      },
    );

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

main().catch((error) => {
  console.error(error);
  cleanup();
  process.exit(1);
});
