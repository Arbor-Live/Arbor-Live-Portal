#!/bin/sh
# Skills live once in .agents/skills; every other skills dir is a symlink.
# This check fails when a symlink is missing, misdirected, or a real copy has
# crept back in, or when a canonical skill lacks SKILL.md frontmatter.
set -eu
cd "$(dirname "$0")/.."

fail=0

check_link() {
  path=$1
  want=$2
  got=$(readlink "$path" 2>/dev/null || echo "(not a symlink)")
  if [ "$got" = "$want" ]; then
    echo "ok: $path -> $want"
  else
    echo "FAIL: $path must be a symlink to $want (got: $got)"
    fail=1
  fi
}

check_link ".claude/skills" "../.agents/skills"
check_link ".cursor/skills" "../.agents/skills"
check_link "packages/backend/.agents/skills" "../../.agents/skills"

for dir in .agents/skills/*/; do
  name=$(basename "$dir")
  if [ ! -f "$dir/SKILL.md" ]; then
    echo "FAIL: $name/SKILL.md missing"
    fail=1
  elif ! grep -q "^name:" "$dir/SKILL.md" || ! grep -q "^description:" "$dir/SKILL.md"; then
    echo "FAIL: $name/SKILL.md missing name/description frontmatter"
    fail=1
  else
    echo "ok: $name"
  fi
done

exit $fail
