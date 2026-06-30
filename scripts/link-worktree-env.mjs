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

function seedSharedEnv(sharedRoot, repoRoot) {
  for (const relativePath of ENV_RELATIVE_PATHS) {
    const sharedPath = path.join(sharedRoot, relativePath);
    if (fs.existsSync(sharedPath)) continue;

    for (const worktree of listWorktrees(repoRoot)) {
      const candidate = path.join(worktree, relativePath);
      if (!fs.existsSync(candidate) || fs.lstatSync(candidate).isSymbolicLink()) {
        continue;
      }
      ensureDir(path.dirname(sharedPath));
      fs.copyFileSync(candidate, sharedPath);
      console.log(`Seeded ${relativePath} from ${worktree}`);
      break;
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
        "Add secrets to the main checkout (or copy from .env.example), then rerun:",
        "  pnpm setup:worktree-env",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Linked ${linked} env file(s) from ${sharedRoot}`);
}

main();
