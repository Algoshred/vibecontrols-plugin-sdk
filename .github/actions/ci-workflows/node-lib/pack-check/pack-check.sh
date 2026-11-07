#!/usr/bin/env bash
# See action.yml. Runs in the package directory.
#   BUILD_COMMAND  command run once when a promised file is missing ('' = never)
#   MIN_DTS        minimum number of .d.ts files in the tarball
#   PACK_CHECK_OUT directory for the result files (default: $RUNNER_TEMP or a temp dir)
set -euo pipefail

min_dts="${MIN_DTS:-0}"
if ! [[ "$min_dts" =~ ^[0-9]+$ ]]; then
  echo "::error::min-dts must be a non-negative integer, not '${min_dts}'"
  exit 2
fi
if [ ! -f package.json ]; then
  echo "::error::no package.json in $(pwd)"
  exit 2
fi
command -v npm > /dev/null || { echo "::error::npm is required for the pack check"; exit 2; }
command -v jq > /dev/null || { echo "::error::jq is required for the pack check"; exit 2; }

out="${PACK_CHECK_OUT:-${RUNNER_TEMP:-$(mktemp -d)}}"
mkdir -p "$out"

# Every concrete file package.json promises. `exports` leaves with a `*`
# pattern are skipped (they name a family of files, not one).
jq -r '
  def leaves: if type == "string" then . elif type == "object" then .[] | leaves
              elif type == "array" then .[] | leaves else empty end;
  [ (if (.bin | type) == "string" then .bin elif (.bin | type) == "object" then .bin[] else empty end),
    (.main // empty), (.module // empty), (.types // empty), (.typings // empty),
    (.exports // {} | leaves) ]
  | .[] | select(type == "string") | select(test("\\*") | not) | sub("^\\./"; "")' package.json \
  | sort -u > "$out/promised.txt"

missing_on_disk=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ -e "$f" ] || missing_on_disk=1
done < "$out/promised.txt"
if [ "$missing_on_disk" -eq 1 ] && [ -n "${BUILD_COMMAND:-}" ]; then
  echo "Build output missing (cached sanity build); running: ${BUILD_COMMAND}"
  bash -euo pipefail -c "$BUILD_COMMAND"
fi

npm pack --dry-run --json --ignore-scripts > "$out/pack.json" 2> "$out/pack.err" || {
  cat "$out/pack.err" >&2
  echo "::error::npm pack --dry-run failed"
  exit 1
}
jq -r '.[0].files[].path' "$out/pack.json" | sed 's#^\./##' | sort -u > "$out/packed.txt"

missing=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if ! grep -Fxq -- "$f" "$out/packed.txt"; then
    echo "::error::package.json promises '${f}' but the tarball does not contain it"
    missing=$((missing + 1))
  fi
done < "$out/promised.txt"

grep -E '\.d\.(ts|mts|cts)$' "$out/packed.txt" > "$out/dts.txt" || true
files=$(wc -l < "$out/packed.txt" | tr -d ' ')
dts=$(wc -l < "$out/dts.txt" | tr -d ' ')
promised=$(wc -l < "$out/promised.txt" | tr -d ' ')
echo "Tarball: ${files} files, ${dts} declaration files, ${promised} promised paths checked"
if [ "$dts" -lt "$min_dts" ]; then
  echo "::error::the tarball holds ${dts} .d.ts files, fewer than min-dts=${min_dts}"
  missing=$((missing + 1))
fi
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "files=${files}"
    echo "dts=${dts}"
    echo "dts-list=${out}/dts.txt"
  } >> "$GITHUB_OUTPUT"
fi
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Pack check"
    echo "* Files: ${files}; declaration files: ${dts} (minimum ${min_dts}); promised paths: ${promised}"
  } >> "$GITHUB_STEP_SUMMARY"
fi
[ "$missing" -eq 0 ]
