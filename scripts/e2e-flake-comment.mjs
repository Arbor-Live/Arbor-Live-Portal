#!/usr/bin/env node
/**
 * Post a PR comment for failed/flaky e2e tests, with screenshots inline.
 *
 * With E2E_COMMENT_TOKEN (a fine-grained PAT with Pull requests: read/write),
 * screenshots upload as GitHub attachments via `gh pr comment --attach`
 * (gh >= 2.99). Attachment uploads refuse GitHub App tokens such as
 * GITHUB_TOKEN, so without the PAT we fall back to pushing them to the scratch
 * MEDIA_BRANCH and linking raw URLs (needs `contents: write`).
 *
 * Fork PRs get a read-only token, so this exits quietly rather than failing the
 * job: a missing comment must never turn a green suite red.
 *
 * Env: GITHUB_TOKEN, E2E_COMMENT_TOKEN (optional), GITHUB_REPOSITORY,
 *      GITHUB_RUN_ID, GITHUB_SERVER_URL, PR_NUMBER,
 *      MEDIA_BRANCH (default "ci-e2e-media")
 */
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resultsPath = path.join(root, "apps/web/e2e-results.json");
const repo = process.env.GITHUB_REPOSITORY ?? "";
const runId = process.env.GITHUB_RUN_ID ?? "";
const serverUrl = process.env.GITHUB_SERVER_URL ?? "https://github.com";
const prNumber = process.env.PR_NUMBER ?? "";
/** A user token can upload attachments; Actions' app token (ghs_) cannot. */
const attachToken = process.env.E2E_COMMENT_TOKEN ?? "";
const mediaBranch = process.env.MEDIA_BRANCH ?? "ci-e2e-media";
/** Identifies our comment so repeat runs edit rather than pile up. */
const MARKER = "<!-- e2e-flake-report -->";
/** Comments get unreadable past a handful of screenshots. */
const MAX_MEDIA = 6;

function sh(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

/** Walk the Playwright JSON report into a flat list of non-passing tests. */
function collectProblems(suite, out = [], titlePath = []) {
  for (const child of suite.suites ?? []) {
    collectProblems(child, out, [...titlePath, child.title]);
  }
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const status = test.status; // "expected" | "unexpected" | "flaky" | "skipped"
      if (status !== "unexpected" && status !== "flaky") continue;
      const attachments = [];
      let error = "";
      for (const result of test.results ?? []) {
        if (!error && result.error?.message) {
          error = String(result.error.message).replace(/\[[0-9;]*m/g, "");
        }
        for (const attachment of result.attachments ?? []) {
          if (attachment.contentType === "image/png" && attachment.path) {
            attachments.push(attachment.path);
          }
        }
      }
      out.push({
        title: [...titlePath, spec.title].filter(Boolean).join(" › "),
        file: spec.file,
        line: spec.line,
        status,
        error: error.split("\n").slice(0, 4).join("\n").trim(),
        attachments,
      });
    }
  }
  return out;
}

function main() {
  if (!fs.existsSync(resultsPath)) {
    console.log("No Playwright JSON report — nothing to comment.");
    return;
  }
  // `--dry-run` renders the comment to stdout and touches no network. Use it to
  // check the report parser after changing Playwright's reporter output.
  const dryRun = process.argv.includes("--dry-run");
  if (!dryRun && (!prNumber || !process.env.GITHUB_TOKEN)) {
    console.log("Not a PR run (or no token) — skipping flake comment.");
    return;
  }

  const report = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
  const problems = collectProblems({ suites: report.suites ?? [] });
  if (!problems.length) {
    console.log("All tests passed cleanly — no flake comment.");
    return;
  }

  const runUrl = `${serverUrl}/${repo}/actions/runs/${runId}`;

  // Copy screenshots to short, unique local paths. With a PAT, `gh --attach`
  // uploads each one and rewrites the Markdown reference that points at it.
  const media = [];
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-media-"));
  if (!dryRun) {
    for (const src of problems.flatMap((p) => p.attachments)) {
      if (media.length >= MAX_MEDIA) break;
      if (!fs.existsSync(src) || media.some((m) => m.src === src)) continue;
      const dest = path.join(staging, `${media.length}-${path.basename(src)}`.replace(/[^\w.-]/g, "_"));
      fs.copyFileSync(src, dest);
      media.push({ src, dest });
    }
  }
  const urlBySrc = new Map(media.map((m) => [m.src, m.dest]));
  if (media.length && !attachToken) {
    pushToMediaBranch(media, urlBySrc);
  }

  const failed = problems.filter((p) => p.status === "unexpected");
  const flaky = problems.filter((p) => p.status === "flaky");

  const lines = [
    MARKER,
    `### E2E: ${failed.length} failed, ${flaky.length} flaky`,
    "",
    `[Full run](${runUrl}) · HTML report and traces are in the run's artifacts.`,
    "",
  ];

  for (const problem of problems) {
    // Markdown emphasis does not render inside <summary>; use HTML.
    const badge =
      problem.status === "unexpected"
        ? "<strong>failed</strong>"
        : "flaky (passed on retry)";
    lines.push(`<details${problem.status === "unexpected" ? " open" : ""}>`);
    lines.push(`<summary>${badge} — ${problem.title}</summary>`);
    lines.push("");
    lines.push(`\`${problem.file}:${problem.line}\``);
    if (problem.error) {
      lines.push("", "```", problem.error, "```");
    }
    const shot = problem.attachments.map((a) => urlBySrc.get(a)).find(Boolean);
    if (shot) {
      lines.push("", `![failure screenshot](${shot})`);
    }
    lines.push("", "</details>", "");
  }

  if (media.length && !urlBySrc.size) {
    lines.push("_Screenshots could not be hosted for inline display — see run artifacts._");
  }

  const body = lines.join("\n");
  if (dryRun) {
    console.log(`--- dry run: ${problems.length} problem(s) ---`);
    console.log(body);
    fs.rmSync(staging, { recursive: true, force: true });
    return;
  }
  const bodyFile = path.join(staging, "comment.md");
  fs.writeFileSync(bodyFile, body);

  // Replace our previous report so reruns don't pile up. `--edit-last` would
  // edit the token owner's latest comment, which need not be this report.
  try {
    const ids = sh("gh", [
      "api",
      `repos/${repo}/issues/${prNumber}/comments`,
      "--paginate",
      "--jq",
      `.[] | select(.body | contains("${MARKER}")) | .id`,
    ]).split("\n").filter(Boolean);
    for (const id of ids) {
      sh("gh", ["api", "--method", "DELETE", `repos/${repo}/issues/comments/${id}`]);
    }
  } catch {
    // An old report left behind is harmless; keep going.
  }

  const comment = (args, env = process.env) =>
    sh("gh", ["pr", "comment", prNumber, "--repo", repo, "--body-file", bodyFile, ...args], {
      env,
    });
  try {
    if (media.length && attachToken) {
      try {
        comment(
          media.map((m) => ["--attach", `${m.dest}#failure screenshot`]).flat(),
          { ...process.env, GH_TOKEN: attachToken },
        );
        console.log(`Posted flake comment with ${media.length} screenshot(s)`);
        return;
      } catch (error) {
        // gh refuses before posting (token kind, permission) or posts with the
        // uploads that succeeded and exits non-zero. Only fall back if nothing
        // was posted.
        console.warn(`Attachment upload failed: ${firstLine(error)}`);
        const posted = sh("gh", [
          "api",
          `repos/${repo}/issues/${prNumber}/comments`,
          "--paginate",
          "--jq",
          `[.[] | select(.body | contains("${MARKER}"))] | length`,
        ]).trim();
        if (posted !== "0") return;
        fs.writeFileSync(
          bodyFile,
          body.replace(/\n\n!\[failure screenshot\]\([^)]*\)/g, "") +
            "\n_Screenshots could not be attached — see the run's artifacts._",
        );
      }
    }
    comment([]);
    console.log("Posted flake comment");
  } catch (error) {
    console.warn(`Could not post flake comment: ${firstLine(error)}`);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * No PAT: stage screenshots on an orphan scratch branch and point `urlBySrc` at
 * their raw URLs. Best-effort: if the push is refused (fork PR, protected
 * branch), clear the map so the comment is text-only.
 */
function pushToMediaBranch(media, urlBySrc) {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-media-branch-"));
  try {
    sh("git", ["init", "-q", "-b", mediaBranch], { cwd: repoDir });
    sh("git", ["config", "user.name", "github-actions[bot]"], { cwd: repoDir });
    sh("git", [
      "config",
      "user.email",
      "41898282+github-actions[bot]@users.noreply.github.com",
    ], { cwd: repoDir });
    const dir = path.join(repoDir, "runs", runId);
    fs.mkdirSync(dir, { recursive: true });
    for (const m of media) fs.copyFileSync(m.dest, path.join(dir, path.basename(m.dest)));
    sh("git", ["add", "-A"], { cwd: repoDir });
    sh("git", ["commit", "-q", "-m", `e2e media for run ${runId}`], { cwd: repoDir });
    const remote = `https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${repo}.git`;
    // Orphan history, force-pushed per run: this branch is a scratch space,
    // never a record. Old runs are replaced rather than accumulated.
    sh("git", ["push", "-q", "--force", remote, `${mediaBranch}:${mediaBranch}`], { cwd: repoDir });
    const base = `https://raw.githubusercontent.com/${repo}/${mediaBranch}/runs/${runId}`;
    for (const m of media) urlBySrc.set(m.src, `${base}/${path.basename(m.dest)}`);
  } catch (error) {
    console.warn(`Could not stage screenshots (text-only comment): ${firstLine(error)}`);
    urlBySrc.clear();
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
}

function firstLine(error) {
  return error instanceof Error ? error.message.split("\n")[0] : String(error);
}

main();
