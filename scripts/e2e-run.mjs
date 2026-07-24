#!/usr/bin/env node
/**
 * Boots Convex + Next (or reuses an existing stack), then runs Playwright e2e.
 *
 * Env:
 *   E2E_SKIP_BOOT=1           — assume services already running on :3000
 *   E2E_BASE_URL              — default http://localhost:3000
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD / E2E_ADMIN_NAME
 *   CONVEX_DEPLOY_KEY         — prefer cloud deployment (recommended for CI).
 *                               When set, skips CONVEX_AGENT_MODE=anonymous.
 *   CONVEX_AGENT_MODE=anonymous — local backend (default in CI only when no deploy key)
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
const deployKey = process.env.CONVEX_DEPLOY_KEY?.trim() || "";
const useCloudDeployment = Boolean(deployKey);
// Anonymous local backends are fine for zero-setup local runs, but under CI
// subscription storms they regularly hit the 1s function budget. Prefer cloud
// whenever a deploy key is available.
const agentMode = useCloudDeployment
  ? undefined
  : (process.env.CONVEX_AGENT_MODE ?? (isCi ? "anonymous" : undefined));

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

function convexEnv(extra = {}) {
  const env = {
    ...process.env,
    ...extra,
  };
  if (deployKey) {
    env.CONVEX_DEPLOY_KEY = deployKey;
  }
  if (agentMode) {
    env.CONVEX_AGENT_MODE = agentMode;
  } else {
    // Ensure a leftover anonymous mode from the workflow/shell does not win
    // when we intentionally target cloud.
    delete env.CONVEX_AGENT_MODE;
  }
  return env;
}

function setConvexEnv(key, value) {
  execFileSync("pnpm", ["exec", "convex", "env", "set", key, value], {
    cwd: backendDir,
    encoding: "utf8",
    env: convexEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForConvexReady(timeoutMs = 240_000) {
  const envLocal = path.join(backendDir, ".env.local");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(envLocal) || useCloudDeployment) {
      try {
        execFileSync("pnpm", ["exec", "convex", "env", "list"], {
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
  throw new Error("Timed out waiting for Convex deployment to become ready.");
}

async function ensureConvexDeploymentEnv(secret) {
  const pairs = [
    ["BETTER_AUTH_SECRET", secret],
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
        ["exec", "convex", "run", "e2eHelpers:getLatestEmailNotification", "{}"],
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

async function main() {
  const secret = resolveBetterAuthSecret();
  process.env.BETTER_AUTH_SECRET = secret;

  if (!skipBoot) {
    ensureLocalBackendEnvFile(secret);

    if (useCloudDeployment) {
      console.log("Starting Convex against cloud deployment (CONVEX_DEPLOY_KEY)…");
    } else {
      console.log(
        `Starting Convex…${agentMode ? ` (CONVEX_AGENT_MODE=${agentMode})` : ""}`,
      );
    }
    run("pnpm", ["exec", "convex", "dev", "--typecheck", "disable"], {
      cwd: backendDir,
      prefix: "convex",
      env: convexEnv(),
    });

    await waitForConvexReady();
    await ensureConvexDeploymentEnv(secret);
    // Env changes force a re-push; wait until helpers exist before starting web/tests.
    await waitForE2eHelpersReady();

    console.log("Starting Next.js…");
    run("pnpm", ["dev"], {
      cwd: webDir,
      prefix: "web",
      env: {
        ...process.env,
        BETTER_AUTH_SECRET: secret,
        SITE_URL: "http://localhost:3000",
        ...(deployKey ? { CONVEX_DEPLOY_KEY: deployKey } : {}),
      },
    });
  } else {
    console.log("E2E_SKIP_BOOT=1 — reusing existing stack");
    await ensureConvexDeploymentEnv(secret).catch((error) => {
      console.warn(`Could not set Convex e2e env (continuing): ${error.message}`);
    });
    await waitForE2eHelpersReady().catch((error) => {
      console.warn(`e2eHelpers not ready (continuing): ${error.message}`);
    });
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
