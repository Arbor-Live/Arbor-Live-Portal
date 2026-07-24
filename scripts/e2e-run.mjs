#!/usr/bin/env node
/**
 * Boots Convex + Next (or reuses an existing stack), then runs Playwright e2e.
 *
 * Env:
 *   E2E_SKIP_BOOT=1     — assume services already running on :3000
 *   E2E_BASE_URL        — default http://localhost:3000
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD / E2E_ADMIN_NAME
 *   CONVEX_AGENT_MODE=anonymous — optional for CI without Convex login
 */
import { spawn } from "child_process";
import { setTimeout as delay } from "timers/promises";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = path.join(root, "packages/backend");
const webDir = path.join(root, "apps/web");
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const skipBoot = process.env.E2E_SKIP_BOOT === "1";

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

async function ensureE2eHelpersEnv() {
  // Best-effort; a failed set should not block the suite when already configured.
  const sets = [
    ["E2E_HELPERS", "true"],
    // Mock Resend in e2e so sends never consume Resend quota.
    ["E2E_EMAIL_MOCK", "true"],
  ];
  for (const [key, value] of sets) {
    await new Promise((resolve) => {
      const child = spawn(
        "pnpm",
        ["exec", "convex", "env", "set", key, value],
        { cwd: backendDir, stdio: "ignore", env: process.env },
      );
      child.on("exit", () => resolve());
    });
  }
}

async function main() {
  if (!skipBoot) {
    console.log("Starting Convex…");
    run("pnpm", ["exec", "convex", "dev"], {
      cwd: backendDir,
      prefix: "convex",
      env: {
        ...process.env,
        ...(process.env.CONVEX_AGENT_MODE ? { CONVEX_AGENT_MODE: process.env.CONVEX_AGENT_MODE } : {}),
      },
    });

    // Wait for .env.local CONVEX_URL or existing deployment readiness.
    const envLocal = path.join(backendDir, ".env.local");
    const start = Date.now();
    while (Date.now() - start < 120_000) {
      if (fs.existsSync(envLocal)) break;
      await delay(500);
    }

    await ensureE2eHelpersEnv().catch((error) => {
      console.warn(`Could not set E2E_HELPERS (continuing): ${error.message}`);
    });

    console.log("Starting Next.js…");
    run("pnpm", ["dev"], {
      cwd: webDir,
      prefix: "web",
    });
  } else {
    console.log("E2E_SKIP_BOOT=1 — reusing existing stack");
    await ensureE2eHelpersEnv().catch((error) => {
      console.warn(`Could not set E2E_HELPERS (continuing): ${error.message}`);
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
