#!/usr/bin/env node
/**
 * Post a PR comment for failed/flaky e2e tests, with screenshots inline.
 *
 * GitHub has no attachment API, so an image only renders in a comment if it is
 * already reachable over HTTP. We push the screenshots to an orphan branch and
 * link their raw URLs — that needs `contents: write` and `pull-requests: write`
 * on GITHUB_TOKEN, but no PAT.
 *
 * Fork PRs get a read-only token, so this exits quietly rather than failing the
 * job: a missing comment must never turn a green suite red.
 *
 * Env: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_SERVER_URL,
 *      PR_NUMBER, MEDIA_BRANCH (default "ci-e2e-media")
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
  let mediaBase = "";
  const uploaded = [];

  // Stage screenshots on the media branch. Best-effort: if the push is refused
  // (fork PR, protected branch), fall back to a text-only comment.
  const media = problems.flatMap((p) => p.attachments).slice(0, MAX_MEDIA);
  if (media.length && !dryRun) {
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-media-"));
    try {
      sh("git", ["init", "-q", "-b", mediaBranch], { cwd: staging });
      sh("git", ["config", "user.name", "github-actions[bot]"], { cwd: staging });
      sh("git", [
        "config",
        "user.email",
        "41898282+github-actions[bot]@users.noreply.github.com",
      ], { cwd: staging });

      const dir = path.join(staging, "runs", runId);
      fs.mkdirSync(dir, { recursive: true });
      media.forEach((src, index) => {
        if (!fs.existsSync(src)) return;
        const name = `${index}-${path.basename(src)}`.replace(/[^\w.-]/g, "_");
        fs.copyFileSync(src, path.join(dir, name));
        uploaded.push({ src, name });
      });

      if (uploaded.length) {
        sh("git", ["add", "-A"], { cwd: staging });
        sh("git", ["commit", "-q", "-m", `e2e media for run ${runId}`], { cwd: staging });
        const remote = `https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${repo}.git`;
        // Orphan history, force-pushed per run: this branch is a scratch space,
        // never a record. Old runs are replaced rather than accumulated.
        sh("git", ["push", "-q", "--force", remote, `${mediaBranch}:${mediaBranch}`], {
          cwd: staging,
        });
        mediaBase = `https://raw.githubusercontent.com/${repo}/${mediaBranch}/runs/${runId}`;
      }
    } catch (error) {
      console.warn(
        `Could not stage screenshots (text-only comment): ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
      );
      mediaBase = "";
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
    }
  }

  const failed = problems.filter((p) => p.status === "unexpected");
  const flaky = problems.filter((p) => p.status === "flaky");
  const uploadedBySrc = new Map(uploaded.map((u) => [u.src, u.name]));

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
    const shot = problem.attachments.map((a) => uploadedBySrc.get(a)).find(Boolean);
    if (shot && mediaBase) {
      lines.push("", `<img src="${mediaBase}/${shot}" width="700" alt="failure screenshot">`);
    }
    lines.push("", "</details>", "");
  }

  if (!mediaBase && media.length && !dryRun) {
    lines.push("_Screenshots could not be hosted for inline display — see run artifacts._");
  }

  const body = lines.join("\n");
  if (dryRun) {
    console.log(`--- dry run: ${problems.length} problem(s), ${media.length} screenshot(s) ---`);
    console.log(body);
    return;
  }
  const bodyFile = path.join(os.tmpdir(), `e2e-comment-${runId}.md`);
  fs.writeFileSync(bodyFile, body);

  // Update our previous comment if one exists, so reruns don't pile up.
  let existingId = "";
  try {
    const raw = sh("gh", [
      "api",
      `repos/${repo}/issues/${prNumber}/comments`,
      "--jq",
      `[.[] | select(.body | contains("${MARKER}")) | .id] | last // ""`,
    ]);
    existingId = raw.trim();
  } catch {
    // fall through to creating a new comment
  }

  try {
    if (existingId) {
      sh("gh", [
        "api",
        "--method",
        "PATCH",
        `repos/${repo}/issues/comments/${existingId}`,
        "-F",
        `body=@${bodyFile}`,
      ]);
      console.log(`Updated flake comment ${existingId}`);
    } else {
      sh("gh", [
        "api",
        "--method",
        "POST",
        `repos/${repo}/issues/${prNumber}/comments`,
        "-F",
        `body=@${bodyFile}`,
      ]);
      console.log("Posted flake comment");
    }
  } catch (error) {
    console.warn(
      `Could not post flake comment: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
    );
  }
}

main();
