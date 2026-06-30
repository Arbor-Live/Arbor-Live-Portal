#!/usr/bin/env node
/**
 * Share gitignored env files across git worktrees.
 *
 * Canonical copies live in $GIT_COMMON_DIR/arbor-env/. Each worktree gets
 * symlinks at the paths the app expects (apps/web, packages/backend).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ENV_RELATIVE_PATHS = [
  "apps/web/.env",
  "apps/web/.env.local",
  "apps/web/.env.production.local",
  "packages/backend/.env",
  "packages/backend/.env.local",
];

/** When no worktree has a real env file yet, seed shared copies from examples. */
const ENV_EXAMPLE_SOURCES = {
  "apps/web/.env": "apps/web/.env.example",
  "apps/web/.env.local": "apps/web/.env.example",
  "packages/backend/.env": "packages/backend/.env.example",
};

function git(command, cwd) {
  return execSync(command, { cwd, encoding: "utf8" }).trim();
}

function resolveGitPath(relativeOrAbsolute, baseDir) {
  return path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.resolve(baseDir, relativeOrAbsolute);
}

function listWorktrees(repoRoot) {
  const lines = git("git worktree list --porcelain", repoRoot).split("\n");
  const worktrees = [];
  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      worktrees.push(line.slice("worktree ".length));
    }
  }
  return worktrees;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function seedSharedEnvFromExample(sharedRoot, repoRoot, relativePath) {
  const exampleRelativePath = ENV_EXAMPLE_SOURCES[relativePath];
  if (!exampleRelativePath) return false;

  const examplePath = path.join(repoRoot, exampleRelativePath);
  if (!fs.existsSync(examplePath)) return false;

  const sharedPath = path.join(sharedRoot, relativePath);
  ensureDir(path.dirname(sharedPath));
  fs.copyFileSync(examplePath, sharedPath);
  console.log(`Seeded ${relativePath} from ${exampleRelativePath}`);
  return true;
}

function seedSharedEnv(sharedRoot, repoRoot) {
  for (const relativePath of ENV_RELATIVE_PATHS) {
    const sharedPath = path.join(sharedRoot, relativePath);
    if (fs.existsSync(sharedPath)) continue;

    let seeded = false;
    for (const worktree of listWorktrees(repoRoot)) {
      const candidate = path.join(worktree, relativePath);
      if (!fs.existsSync(candidate) || fs.lstatSync(candidate).isSymbolicLink()) {
        continue;
      }
      ensureDir(path.dirname(sharedPath));
      fs.copyFileSync(candidate, sharedPath);
      console.log(`Seeded ${relativePath} from ${worktree}`);
      seeded = true;
      break;
    }

    if (!seeded) {
      seedSharedEnvFromExample(sharedRoot, repoRoot, relativePath);
    }
  }
}

function linkEnvFile(relativePath, sharedRoot, repoRoot) {
  const sharedPath = path.join(sharedRoot, relativePath);
  if (!fs.existsSync(sharedPath)) return false;

  const linkPath = path.join(repoRoot, relativePath);
  ensureDir(path.dirname(linkPath));

  if (fs.existsSync(linkPath)) {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      const currentTarget = fs.readlinkSync(linkPath);
      if (path.resolve(path.dirname(linkPath), currentTarget) === sharedPath) {
        return true;
      }
      fs.unlinkSync(linkPath);
    } else {
      // Keep the newest real file as canonical, then replace with a symlink.
      const linkMtime = fs.statSync(linkPath).mtimeMs;
      const sharedMtime = fs.statSync(sharedPath).mtimeMs;
      if (linkMtime > sharedMtime) {
        fs.copyFileSync(linkPath, sharedPath);
        console.log(`Updated shared ${relativePath} from this worktree`);
      }
      fs.unlinkSync(linkPath);
    }
  }

  fs.symlinkSync(sharedPath, linkPath);
  console.log(`Linked ${relativePath}`);
  return true;
}

function main() {
  const repoRoot = git("git rev-parse --show-toplevel", process.cwd());
  const gitCommonDir = resolveGitPath(
    git("git rev-parse --git-common-dir", repoRoot),
    repoRoot,
  );
  const sharedRoot = path.join(gitCommonDir, "arbor-env");

  ensureDir(sharedRoot);
  seedSharedEnv(sharedRoot, repoRoot);

  let linked = 0;
  for (const relativePath of ENV_RELATIVE_PATHS) {
    if (linkEnvFile(relativePath, sharedRoot, repoRoot)) linked += 1;
  }

  if (linked === 0) {
    console.warn(
      [
        "No env files linked.",
        "Create shared env files, then rerun:",
        "  pnpm setup:worktree-env",
        "",
        "First-time setup (run once in any checkout):",
        "  cp packages/backend/.env.example \"$(git rev-parse --git-common-dir)/arbor-env/packages/backend/.env\"",
        "  cp apps/web/.env.example \"$(git rev-parse --git-common-dir)/arbor-env/apps/web/.env\"",
        "  # Edit those files with real secrets, then:",
        "  cd packages/backend && pnpm dev   # writes .env.local with CONVEX_DEPLOYMENT",
        "  pnpm setup:worktree-env",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  const missing = ENV_RELATIVE_PATHS.filter(
    (relativePath) => !fs.existsSync(path.join(sharedRoot, relativePath)),
  );
  if (missing.length > 0) {
    console.warn(
      [
        `Linked ${linked} env file(s) from ${sharedRoot}.`,
        "Still missing in the shared store:",
        ...missing.map((relativePath) => `  - ${relativePath}`),
        "",
        "packages/backend/.env.local is created by `pnpm --filter backend dev` (Convex CLI).",
        "apps/web/.env.local is optional; apps/web/.env + backend env are enough for local dev.",
      ].join("\n"),
    );
  } else {
    console.log(`Linked ${linked} env file(s) from ${sharedRoot}`);
  }
}

main();
