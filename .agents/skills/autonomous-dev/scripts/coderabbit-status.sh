#!/bin/sh
# One-shot PR state for the autonomous loop: head vs last CodeRabbit review,
# any review-limit notice (with its wait), unresolved threads, merge state,
# and checks. Usage: coderabbit-status.sh [pr-number]  (defaults to current branch's PR)
set -eu

pr=${1:-$(gh pr view --json number -q .number)}
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
owner=${repo%/*}
name=${repo#*/}

head=$(gh pr view "$pr" --json headRefOid -q .headRefOid)
echo "PR #$pr  head ${head%"${head#????????}"}"

printf "\n%s\n" "== Last CodeRabbit review"
gh api "repos/$repo/pulls/$pr/reviews" --paginate --jq '
  [.[] | select(.user.login | test("coderabbit"))] | last
  | if . == null then "none yet"
    else "\(.submitted_at)  commit \(.commit_id[0:8])  \(.body | capture("Actionable comments posted: (?<n>[0-9]+)").n // "0") actionable"
    end'

printf "\n%s\n" "== Review-limit notice (CodeRabbit edits its summary comment in place)"
gh api "repos/$repo/issues/$pr/comments" --paginate --jq '
  [.[] | select(.user.login | test("coderabbit"))
       | select(.body | test("rate limited by coderabbit|Review limit reached|Rate limit exceeded"; "i"))] | last
  | if . == null then "none"
    else "updated \(.updated_at)  \(.body | [scan("(?:available in|wait) [^.*\n]*")] | first // "no wait time found")"
    end'

printf "\n%s\n" "== Unresolved review threads"
gh api graphql -F owner="$owner" -F name="$name" -F pr="$pr" -f query='
  query($owner: String!, $name: String!, $pr: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes {
            id isResolved isOutdated path line
            comments(first: 1) { nodes { author { login } body } }
          }
        }
      }
    }
  }' --jq '
  [.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not)]
  | if length == 0 then "none"
    else .[] | "\(.id)  \(.path):\(.line // "?")\(if .isOutdated then " (outdated)" else "" end)  \(.comments.nodes[0].author.login): \(.comments.nodes[0].body | gsub("<[^>]*>"; "") | gsub("\\s+"; " ") | .[0:140])"
    end'

printf "\n%s\n" "== Merge state"
gh pr view "$pr" --json mergeable,mergeStateStatus,reviewDecision \
  -q '"mergeable=\(.mergeable)  state=\(.mergeStateStatus)  decision=\(if (.reviewDecision // "") == "" then "none" else .reviewDecision end)"'

printf "\n%s\n" "== Checks"
gh pr checks "$pr" || true
