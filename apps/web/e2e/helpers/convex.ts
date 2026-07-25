import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

export const backendDir = path.join(__dirname, "../../../../packages/backend");

function readEnvValue(file: string, keys: string[]): string | null {
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, "utf8").split("\n");
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
 * Deployment the app under test is actually talking to.
 *
 * Mirrors the precedence in `apps/web/next.config.ts`, which loads
 * `packages/backend/.env.local` and prefers `CONVEX_URL` — that file is written
 * by `convex dev` in both cloud and `CONVEX_AGENT_MODE=anonymous` runs, so this
 * resolves correctly locally and in CI.
 *
 * Deliberately throws rather than falling back to a literal URL: a hardcoded
 * default silently pointed CI at a different deployment than the one issuing
 * its auth tokens, which is a far worse failure than a missing value.
 */
export function resolveConvexUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_CONVEX_URL?.trim() ||
    process.env.CONVEX_URL?.trim() ||
    process.env.CONVEX_CLOUD_URL?.trim();
  if (fromEnv) return fromEnv;

  const keys = ["CONVEX_URL", "CONVEX_CLOUD_URL", "NEXT_PUBLIC_CONVEX_URL"];
  for (const file of [".env.local", ".env"]) {
    const value = readEnvValue(path.join(backendDir, file), keys);
    if (value) return value;
  }

  throw new Error(
    "Could not resolve the Convex deployment URL. Set NEXT_PUBLIC_CONVEX_URL/CONVEX_URL, " +
      `or ensure ${path.join(backendDir, ".env.local")} exists (written by \`convex dev\`).`,
  );
}

export function runConvex(functionName: string, args: unknown = {}) {
  const raw = execFileSync(
    "pnpm",
    ["exec", "convex", "run", functionName, JSON.stringify(args)],
    {
      cwd: backendDir,
      encoding: "utf8",
      env: process.env,
    },
  );
  // `convex run` prints nothing at all for a null result (the CLI exits 0), so
  // an empty body is a successful null rather than a parse failure.
  if (!raw.trim()) return null;

  const match = raw.match(/\{[\s\S]*\}\s*$|null\s*$|\[[\s\S]*\]\s*$/);
  if (!match) {
    throw new Error(`Unexpected convex run output for ${functionName}:\n${raw}`);
  }
  const trimmed = match[0].trim();
  if (trimmed === "null") return null;
  return JSON.parse(trimmed);
}

export async function pollConvex<T>(
  functionName: string,
  args: unknown,
  predicate: (value: T | null) => boolean,
  options?: { attempts?: number; delayMs?: number },
): Promise<T> {
  const attempts = options?.attempts ?? 40;
  const delayMs = options?.delayMs ?? 500;
  let last: T | null = null;
  for (let i = 0; i < attempts; i += 1) {
    last = runConvex(functionName, args) as T | null;
    if (predicate(last)) return last as T;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(
    `Timed out waiting for ${functionName} with args ${JSON.stringify(args)}. Last value: ${JSON.stringify(last)}`,
  );
}
