#!/bin/sh
# Upload PNG/JPG/GIF files to the orphan `pr-assets` branch and print Markdown
# image lines for the PR body. The repo is public, so raw URLs render in PRs.
# `pr-assets` only receives pushes, which no workflow listens to (CI runs on
# pull_request and pushes to main), so uploads cost no CI.
# Usage: upload-screenshots.sh <file>...   (folder = current branch name)
set -eu

[ $# -gt 0 ] || { echo "usage: $0 <image>..." >&2; exit 1; }

repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
branch=$(git rev-parse --abbrev-ref HEAD)
stamp=$(date +%Y%m%d-%H%M%S)

if ! git ls-remote --exit-code --heads origin pr-assets >/dev/null 2>&1; then
  empty_tree=$(git mktree </dev/null)
  root=$(git commit-tree "$empty_tree" -m "Screenshot assets for PR descriptions")
  git push -q origin "$root:refs/heads/pr-assets"
fi

payload=$(mktemp)
trap 'rm -f "$payload"' EXIT

for file in "$@"; do
  base=$(basename "$file")
  path="$branch/$stamp-$base"
  base64 <"$file" | tr -d '\n' >"$payload.b64"
  jq -n --arg msg "Add $base for $branch" --rawfile content "$payload.b64" \
    '{message: $msg, branch: "pr-assets", content: $content}' >"$payload"
  rm -f "$payload.b64"
  url=$(gh api -X PUT "repos/$repo/contents/$path" --input "$payload" -q .content.download_url)
  alt=$(echo "${base%.*}" | tr '_-' '  ')
  echo "![$alt]($url)"
done
