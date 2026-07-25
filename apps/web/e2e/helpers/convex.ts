import { execFileSync } from "child_process";
import path from "path";

export const backendDir = path.join(__dirname, "../../../../packages/backend");

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
