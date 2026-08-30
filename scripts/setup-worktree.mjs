#!/usr/bin/env node
/**
 * One-command dev environment for this worktree:
 *
 *   pnpm setup:worktree-env
 *
 * In a feature worktree this:
 *   1. links the shared env files (scripts/link-worktree-env.mjs)
 *   2. switches to isolated local Convex and allocates this worktree's ports
 *      (Convex cloud/site + Next.js web port) in the shared registry
 *   3. repairs the shared packages/backend/.env gotchas (placeholder CONVEX_*
 *      URLs shadowing local config, missing BETTER_AUTH_SECRET)
 *   4. boots `convex dev` on this worktree's ports and sets the deployment
 *      env (auth secret, SITE_URL for this web port, dry-run email, dev-seed
 *      helpers)
 *   5. seeds a loginable admin plus crew/band accounts, an event with a
 *      schedule, and a quote in the approval funnel
 *   6. shuts the temporary backend down — data persists — and prints how to
 *      start dev
 *
 * After it finishes, `pnpm run dev` is conflict-free with every other
 * worktree. On the main checkout there is nothing to isolate, so it only does
 * 1 and 3 and prints the manual trunk steps.
 */
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { isPortFree, stopProcessesOnPort } from "./lib/ports.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = path.join(root, "packages/backend");
// Spawn the real JS entry rather than the .bin sh wrapper — going through the
// wrapper (libuv's ENOEXEC sh fallback) breaks the CLI's local-backend spawn.
const convexEntry = path.join(root, "node_modules", "convex", "bin", "main.js");

function git(command) {
  return execFileSync("git", command, { cwd: root, encoding: "utf8" }).trim();
}

function gitCommonDir() {
  const raw = git(["rev-parse", "--git-common-dir"]);
  return path.isAbsolute(raw) ? raw : path.resolve(root, raw);
}

const registryFile = path.join(gitCommonDir(), "arbor-env", "worktree-convex.json");

/** Same defaults the e2e helpers use, so one set of creds works everywhere. */
const ADMIN_EMAIL = process.env.DEV_ADMIN_EMAIL ?? "dev-admin@arborlive.test";
const DEV_PASSWORD = process.env.DEV_ADMIN_PASSWORD ?? "ArborDevPassword1!";

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

function convexEnv() {
  return { ...process.env, CONVEX_AGENT_MODE: "anonymous" };
}

function isMainCheckout() {
  const gitDir = git(["rev-parse", "--git-dir"]);
  const commonDir = git(["rev-parse", "--git-common-dir"]);
  return path.resolve(root, gitDir) === path.resolve(root, commonDir);
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

/**
 * Shared packages/backend/.env is read by next.config before .env.local and
 * first value wins, so placeholder CONVEX_* URLs there shadow the real local
 * ones and break sign-in. Strip only the placeholders; a real cloud URL is
 * left alone. A missing BETTER_AUTH_SECRET is generated once and persisted —
 * the web app reads it from this file, so it must live here, not in process
 * env.
 */
function repairSharedBackendEnv() {
  const envPath = path.join(backendDir, ".env");
  let current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const stripped = current
    .split("\n")
    .filter((line) => !/^\s*CONVEX_(CLOUD|SITE)_URL=https:\/\/your-convex-deployment/.test(line))
    .join("\n");
  const secret = readEnvValue(envPath, "BETTER_AUTH_SECRET");
  const needsSecret = !secret || secret.length < 32;
  if (stripped === current && !needsSecret) return;
  let contents = stripped.endsWith("\n") || stripped === "" ? stripped : `${stripped}\n`;
  if (needsSecret) {
    contents += `BETTER_AUTH_SECRET=${crypto.randomBytes(32).toString("hex")}\n`;
  }
  fs.writeFileSync(envPath, contents);
  console.log("setup:worktree-env: repaired packages/backend/.env (shared across worktrees)");
}

async function waitForConvexReady(timeoutMs = 240_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      execFileSync(process.execPath, [convexEntry, "env", "list"], { cwd: backendDir, env: convexEnv(), stdio: "pipe" });
      return;
    } catch {
      await delay(2000);
    }
  }
  throw new Error("Timed out waiting for the local Convex backend to become ready.");
}

/**
 * `convex env set` on a just-booted anonymous backend can race provisioning
 * and fail once even though the deployment is reachable (see e2e-run.mjs).
 */
async function setConvexEnvWithRetry(key, value, { attempts = 6, delayMs = 10_000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      execFileSync(process.execPath, [convexEntry, "env", "set", key, value], {
        cwd: backendDir,
        env: convexEnv(),
        stdio: ["ignore", "pipe", "pipe"],
      });
      return;
    } catch (error) {
      const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
      if (attempt === attempts) {
        throw new Error(`Could not set Convex env ${key} after ${attempts} attempts: ${detail}`);
      }
      await delay(delayMs);
    }
  }
}

/** Env changes force a re-push; wait until the seed helpers actually exist. */
async function waitForSeedHelpers(timeoutMs = 300_000) {
  const start = Date.now();
  let lastError = "";
  while (Date.now() - start < timeoutMs) {
    try {
      execFileSync(
        process.execPath,
        [convexEntry, "run", "e2eHelpers:getLatestEmailNotification", "{}"],
        { cwd: backendDir, env: convexEnv(), stdio: ["ignore", "pipe", "pipe"] },
      );
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await delay(3000);
    }
  }
  throw new Error(`Timed out waiting for seed helpers after Convex boot. Last error:\n${lastError}`);
}

function runSeed(functionName, args) {
  execFileSync(process.execPath, [convexEntry, "run", `e2eHelpers:${functionName}`, JSON.stringify(args)], {
    cwd: backendDir,
    env: convexEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function seed() {
  console.log("setup:worktree-env: seeding accounts and demo data…");
  runSeed("ensureAdmin", { email: ADMIN_EMAIL, password: DEV_PASSWORD, name: "Arbor Admin" });
  console.log(`  admin:  ${ADMIN_EMAIL}`);
  const extras = [
    ["ensureCrewUser", { email: "dev-crew@arborlive.test", password: DEV_PASSWORD, name: "Crew Avery" }],
    ["ensureCrewUser", { email: "dev-crew-b@arborlive.test", password: DEV_PASSWORD, name: "Crew Blake" }],
    ["ensureBandPayeeUser", { email: "dev-band@arborlive.test", password: DEV_PASSWORD, name: "Band Rowan", bandName: "The Sequoias" }],
    ["seedCrewedEventWithSchedule", { title: "Dev Seed — Coffeehouse", traineeReady: true }],
    ["seedApprovablePublicQuote", { clientGroupName: "Dev Seed Client Group" }],
  ];
  for (const [functionName, args] of extras) {
    try {
      runSeed(functionName, args);
    } catch (error) {
      // One stale/wrong-shape seeder should not sink the whole setup —
      // the account to log in with is the hard requirement.
      console.warn(
        `  seed ${functionName} failed (continuing): ${
          error instanceof Error ? error.message.split("\n")[0] : String(error)
        }`,
      );
      continue;
    }
    console.log(`  seeded: ${functionName}`);
  }
  console.log(`  crew:   dev-crew@arborlive.test, dev-crew-b@arborlive.test`);
  console.log(`  band:   dev-band@arborlive.test`);
  console.log(`  password for all seeded accounts: ${DEV_PASSWORD}`);
}

function readWorktreePorts() {
  const entry = JSON.parse(fs.readFileSync(registryFile, "utf8")).worktrees?.[root];
  if (!entry?.cloudPort || !entry?.sitePort || !entry?.webPort) {
    throw new Error(
      `No ports registered for this worktree in ${registryFile} — did scripts/worktree-convex.mjs local run?`,
    );
  }
  return entry;
}

async function main() {
  if (!fs.existsSync(convexEntry)) {
    throw new Error("Convex CLI not found — run `pnpm install` first.");
  }

  repairSharedBackendEnv();

  if (isMainCheckout()) {
    console.log(
      [
        "",
        "This is the main checkout, so there is nothing to isolate.",
        "Manual trunk setup (see docs/getting-started.md):",
        "  pnpm dev:backend        # convex dev against the shared trunk deployment",
        "  open /setup             # create the first admin once the web app is up",
        "",
      ].join("\n"),
    );
    return;
  }

  console.log("setup:worktree-env: switching to isolated local Convex…");
  await new Promise((resolve, reject) => {
    const child = run("node", [path.join(root, "scripts/worktree-convex.mjs"), "local"], {
      prefix: "worktree-convex",
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`worktree-convex local exited with code ${code}`))));
  });
  const ports = readWorktreePorts();

  // `convex dev` requires BOTH its ports free (it does not reattach), and a
  // SIGTERMed backend can hold the site port for a few seconds after the
  // cloud port frees — clear and verify both, plus the web port.
  console.log(
    `setup:worktree-env: freeing ports :${ports.cloudPort}/:${ports.sitePort}/:${ports.webPort}…`,
  );
  for (const port of [ports.cloudPort, ports.sitePort, ports.webPort]) {
    await stopProcessesOnPort(port);
    if (!(await isPortFree(port))) {
      throw new Error(
        `port ${port} is still in use by another process — stop it and rerun pnpm setup:worktree-env`,
      );
    }
  }

  console.log(
    `setup:worktree-env: booting local Convex on :${ports.cloudPort} (HTTP actions :${ports.sitePort})…`,
  );
  const devArgs = [
    "dev",
    "--typecheck",
    "disable",
    "--local-cloud-port",
    String(ports.cloudPort),
    "--local-site-port",
    String(ports.sitePort),
  ];
  run(process.execPath, [convexEntry, ...devArgs], { cwd: backendDir, prefix: "convex", env: convexEnv() });

  await waitForConvexReady();
  const siteUrl = `http://localhost:${ports.webPort}`;
  const secret = readEnvValue(path.join(backendDir, ".env"), "BETTER_AUTH_SECRET");
  for (const [key, value] of [
    ["BETTER_AUTH_SECRET", secret],
    ["SITE_URL", siteUrl],
    ["EMAIL_TEST_MODE", "true"],
    // e2eHelpers is gated on this flag plus a localhost SITE_URL, so the seed
    // endpoints are only callable on local dev deployments like this one.
    ["E2E_HELPERS", "true"],
  ]) {
    await setConvexEnvWithRetry(key, value);
  }
  await waitForSeedHelpers();
  await seed();

  // SIGTERM to `convex dev` can leave the backend binary listening — free the
  // ports so `pnpm run dev` starts from a clean slate.
  cleanup();
  for (const port of [ports.cloudPort, ports.sitePort, ports.webPort]) {
    await stopProcessesOnPort(port);
  }
  console.log(
    [
      "",
      "Setup complete. This worktree is isolated:",
      `  web:    http://localhost:${ports.webPort}   (run \`pnpm run dev\`)`,
      `  convex: http://127.0.0.1:${ports.cloudPort} (HTTP actions :${ports.sitePort})`,
      `  admin:  ${ADMIN_EMAIL} / ${DEV_PASSWORD}`,
      "",
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error(`setup:worktree-env: ${error instanceof Error ? error.message : error}`);
  cleanup();
  process.exit(1);
});
