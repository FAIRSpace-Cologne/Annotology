#!/usr/bin/env bash
#
# query_backend.sh — for every (title, description) row in the gold-standard
# CSV, query the annotation backend's /api/annotate-term endpoint against
# three services (zooma, tib, ontobee), asking for up to 25 results each,
# and save every raw response to disk for later reranking/scoring.
#
# Usage:
#   BACKEND_URL=http://localhost:5000 ./query_backend.sh [csv_path] [out_dir]
#
#   csv_path   defaults to Gold_Standard_Annotations.csv
#   out_dir    defaults to backend_results
#
# Requires: curl, jq, python3 (only used for CSV parsing — see below)

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:5000}"
CSV_PATH="${1:-Gold_Standard_Annotations.csv}"
OUT_DIR="${2:-backend_results}"
ROWS=25
SERVICES=(zooma tib ontobee)

for bin in curl jq python3; do
  command -v "$bin" >/dev/null 2>&1 || { echo "Error: '$bin' is required but not found on PATH." >&2; exit 1; }
done

if [ ! -f "$CSV_PATH" ]; then
  echo "Error: CSV file not found: $CSV_PATH" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# ── CSV -> JSONL ──────────────────────────────────────────────────────────────
#
# Some description fields in the gold-standard CSV contain commas inside
# quoted fields (e.g. "Factors defined by the experimenter (e.g. age, breed,
# fertility status)."). Naively splitting on commas in bash would silently
# corrupt those rows, so csv parsing is handed off to Python's csv module
# once, up front. Everything after this is plain bash + curl + jq working
# off the resulting clean, one-object-per-line JSONL file.
JSONL_PATH="$OUT_DIR/_rows.jsonl"
python3 - "$CSV_PATH" > "$JSONL_PATH" <<'PYEOF'
import csv, json, sys

with open(sys.argv[1], newline='', encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        print(json.dumps({
            "title": (row.get("title") or "").strip(),
            "description": (row.get("description") or "").strip(),
            "termURI": (row.get("termURI") or "").strip(),
        }))
PYEOF

# Deterministic, filesystem-safe slug for a title — mirrored exactly by the
# Python scoring script so it can locate these same files by (row index,
# slugified title) without needing a separate manifest file.
slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/_/g; s/^_+|_+$//g'
}

total_rows=$(wc -l < "$JSONL_PATH" | tr -d '[:space:]')
row_index=0
fail_count=0

echo "Querying $BACKEND_URL for $total_rows term(s) across ${#SERVICES[@]} services (up to $ROWS results each)..."
echo "Output directory: $OUT_DIR"
echo

while IFS= read -r row_json; do
  row_index=$((row_index + 1))

  title=$(jq -r '.title' <<<"$row_json")
  description=$(jq -r '.description' <<<"$row_json")

  if [ -z "$title" ]; then
    echo "[$row_index/$total_rows] Skipping row with empty title"
    continue
  fi

  slug=$(slugify "$title")
  echo "[$row_index/$total_rows] \"$title\""

  for service in "${SERVICES[@]}"; do
    out_file="$OUT_DIR/${row_index}__${slug}__${service}.json"

    payload=$(jq -n \
      --arg term "$title" \
      --arg desc "$description" \
      --arg service "$service" \
      --argjson rows "$ROWS" \
      '{terms: [$term], descriptions: [$desc], target_ontology: "all", rows: $rows, start: 0, service: $service}')

    http_code=$(curl -sS --max-time 45 -o "$out_file" -w '%{http_code}' \
      -X POST "$BACKEND_URL/api/annotate-term" \
      -H "Content-Type: application/json" \
      -d "$payload" || echo "000")

    if [ "$http_code" = "200" ]; then
      n_mappings=$(jq -r '.results[0].mappings | length' "$out_file" 2>/dev/null || echo "?")
      echo "    $service: HTTP 200, $n_mappings result(s) -> $out_file"
    else
      echo "    $service: HTTP $http_code (see $out_file for details)" >&2
      fail_count=$((fail_count + 1))
    fi

    sleep 0.2  # be polite to upstream ontology services proxied by the backend
  done
done < "$JSONL_PATH"

echo
echo "Done. $((row_index)) term(s) queried, $fail_count request failure(s)."
echo "Results saved under: $OUT_DIR"
