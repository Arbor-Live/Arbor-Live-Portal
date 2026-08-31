#!/usr/bin/env node
/**
 * Remove stale git worktrees:
 *
 *   pnpm prune               # remove merged-PR worktrees + 7-day-stale ones
 *   pnpm prune --dry-run     # show what would happen, change nothing
 *   pnpm prune --days=14     # custom staleness threshold
 *   pnpm prune --force       # also remove stale worktrees with uncommitted changes
 *
 * A worktree is removed when its branch's PR is merged (via `gh`, falling back
 * to an ancestry check against origin/main when gh is unavailable) or when its
 * last commit is older than `--days`. Worktrees with uncommitted changes are
 * never removed without --force — merged branches included — so WIP is never
 * destroyed silently. The main checkout and the worktree this runs in are
 * always kept. Afterwards the worktree-convex port registry is cleaned of
 * entries whose worktree no longer exists.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const daysArg = args.find((arg) => arg.startsWith("--days="));
const days = daysArg ? Number(daysArg.split("=")[1]) : 7;
if (!Number.isFinite(days) || days < 0) {
  console.error(`prune: invalid --days value: ${daysArg ?? ""}`);
  process.exit(1);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const staleCutoffMs = days * DAY_MS;

function git(gitArgs, cwd = root) {
  return execFileSync("git", gitArgs, { cwd, encoding: "utf8" }).trim();
}

function tryGit(gitArgs, cwd = root) {
  try {
    return git(gitArgs, cwd);
  } catch {
    return null;
  }
}

function realpathOrNull(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

function listWorktrees() {
  const entries = [];
  let current = null;
  for (const line of git(["worktree", "list", "--porcelain"]).split("\n")) {
    if (line.startsWith("worktree ")) {
      current = { path: line.slice("worktree ".length), branch: null, head: null };
      entries.push(current);
    } else if (!current) {
      continue;
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).replace("refs/heads/", "");
    }
  }
  return entries;
}

let ghAvailable = true;
let ghMissingReported = false;
let mergedBranches = null;

/** One `gh pr list` call for the whole repo — per-branch lookups are too slow. */
function loadMergedBranches() {
  if (mergedBranches !== null) return mergedBranches;
  if (ghAvailable) {
    try {
      const lines = execFileSync(
        "gh",
        ["pr", "list", "--state", "merged", "--limit", "1000", "--json", "headRefName"],
        { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      mergedBranches = new Set(
        JSON.parse(lines)
          .map((pr) => pr.headRefName)
          .filter(Boolean),
      );
      return mergedBranches;
    } catch (error) {
      ghAvailable = false;
      if (error?.code === "ENOENT" && !ghMissingReported) {
        ghMissingReported = true;
        console.warn(
          "prune: gh CLI not found — merged-PR detection falls back to an ancestry check against origin/main (squash-merged PRs will not be detected)",
        );
      }
    }
  }
  mergedBranches = new Set();
  return mergedBranches;
}

/** Ancestry fallback: catches merge-commit merges, misses squash merges. */
function isAncestorOfDefault(branch) {
  if (!tryGit(["rev-parse", "--verify", branch])) return false;
  for (const candidate of ["origin/main", "origin/master"]) {
    if (!tryGit(["rev-parse", "--verify", candidate])) continue;
    try {
      // Exits non-zero when the branch is NOT an ancestor.
      git(["merge-base", "--is-ancestor", branch, candidate]);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function isMerged(entry) {
  const merged = loadMergedBranches();
  if (entry.branch) {
    if (merged.has(entry.branch)) return true;
    // gh could not tell us (missing/unauthenticated) — fall back to ancestry.
    return ghAvailable ? false : isAncestorOfDefault(entry.branch);
  }
  // Detached HEAD: merged when the exact commit is reachable from default.
  if (!entry.head) return false;
  for (const candidate of ["origin/main", "origin/master"]) {
    if (!tryGit(["rev-parse", "--verify", candidate])) continue;
    try {
      git(["merge-base", "--is-ancestor", entry.head, candidate]);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function lastCommitAgeMs(entry) {
  const ref = entry.branch ?? entry.head;
  if (!ref) return 0;
  // Number(null) / Number("") are 0 — treat a failed git log as unknown age,
  // never as "ancient" (which would classify the worktree stale and remove it).
  const raw = tryGit(["log", "-1", "--format=%ct", ref]);
  const committedAt = raw ? Number(raw) : Number.NaN;
  if (!Number.isFinite(committedAt) || committedAt <= 0) return 0;
  return Date.now() - committedAt * 1000;
}

function isDirty(entry) {
  try {
    return git(["status", "--porcelain"], entry.path).length > 0;
  } catch {
    return false;
  }
}

function removeWorktree(entry, reason) {
  if (dryRun) return true;
  try {
    git(["worktree", "remove", "--force", entry.path]);
    return true;
  } catch (error) {
    console.warn(
      `prune: could not remove ${entry.path} (${reason}): ${
        error instanceof Error ? error.message.split("\n")[0] : error
      }`,
    );
    return false;
  }
}

function deleteBranch(branch) {
  if (dryRun) return;
  // -D because squash-merged branches are not ancestors of main.
  tryGit(["branch", "-D", branch]);
}

function cleanRegistry() {
  const registryPath = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const file = path.join(registryPath, "arbor-env", "worktree-convex.json");
  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return;
  }
  const before = Object.keys(registry.worktrees ?? {}).length;
  registry.worktrees = Object.fromEntries(
    Object.entries(registry.worktrees ?? {}).filter(([worktreePath]) =>
      fs.existsSync(worktreePath),
    ),
  );
  if (Object.keys(registry.worktrees).length === before) return;
  if (dryRun) {
    console.log(
      `prune (dry run): would drop ${
        before - Object.keys(registry.worktrees).length
      } registry entries for removed worktrees`,
    );
    return;
  }
  fs.writeFileSync(file, `${JSON.stringify(registry, null, 2)}\n`);
}

function main() {
  // Protect the worktree containing the current directory by its root — `pnpm
  // prune` is often run from a subdirectory (pnpm resolves the package root).
  const currentWorktree = tryGit(["rev-parse", "--show-toplevel"], process.cwd());
  const currentPath = realpathOrNull(currentWorktree ?? process.cwd());
  const entries = listWorktrees();
  if (entries.length === 0) return;

  const mainPath = entries[0].path; // first entry is always the main checkout
  let removed = 0;

  for (const entry of entries) {
    const entryPath = realpathOrNull(entry.path);
    if (entryPath === realpathOrNull(mainPath) || entryPath === currentPath) continue;

    const ageMs = lastCommitAgeMs(entry);
    const ageDays = Math.floor(ageMs / DAY_MS);
    const merged = isMerged(entry);
    const stale = ageMs >= staleCutoffMs;
    const label = entry.branch ?? `detached @ ${(entry.head ?? "").slice(0, 7)}`;

    if (!merged && !stale) {
      console.log(`keep      ${label.padEnd(40)} active (${ageDays}d old)`);
      continue;
    }

    const reason = merged ? "merged" : `stale (${ageDays}d old)`;
    if (isDirty(entry) && !force) {
      console.log(
        `skipped   ${label.padEnd(40)} ${reason} but has uncommitted changes (rerun with --force)`,
      );
      continue;
    }

    if (removeWorktree(entry, reason)) {
      removed += 1;
      if (merged && entry.branch) deleteBranch(entry.branch);
      console.log(
        `${dryRun ? "would rm  " : "removed   "}${label.padEnd(40)} ${reason}${
          merged && entry.branch ? " + branch" : ""
        }`,
      );
    }
  }

  if (!dryRun) {
    tryGit(["worktree", "prune"]);
  }
  cleanRegistry();
  console.log(
    dryRun
      ? `prune (dry run): ${removed} worktree(s) would be removed`
      : `prune: removed ${removed} worktree(s)`,
  );
}

main();
