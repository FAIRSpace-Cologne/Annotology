"""
score_reranker.py

Reads the gold-standard annotation CSV, loads the backend search results that
query_backend.sh saved for each (title, description) pair (up to 25 results
each from zooma, tib and ontobee), reranks the merged candidate pool with the
same BM25 + combined-field SentenceTransformer pipeline as
ontology_reranking_colab.py, and reports micro- and macro-averaged top-3 /
top-5 accuracy:

  Micro-averaged  = pool every row together, one overall hit-rate.
                    A gold answer that appears in more rows implicitly
                    counts more (same as a plain overall accuracy).

  Macro-averaged  = group rows by their gold label (termURI, by default —
                    the standard "per class" grouping, same idea as
                    macro-F1), compute the hit-rate within each group, then
                    average those per-group rates with every group weighted
                    equally. This stops an answer that happens to repeat
                    across several rows from dominating the score.

Usage:
    pip install sentence-transformers rank-bm25 rapidfuzz pandas scikit-learn
    python score_reranker.py \
        --csv Gold_Standard_Annotations.csv \
        --results-dir backend_results \
        --out reranked_results.csv
"""

import argparse
import csv
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from rank_bm25 import BM25Okapi
from rapidfuzz.fuzz import ratio
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

SERVICES = ("zooma", "tib", "ontobee")
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"


# ── CSV row -> result-file lookup ────────────────────────────────────────────
#
# Mirrors query_backend.sh's slugify() exactly, so a row's saved backend
# results can be found without needing a separate manifest file.


def slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def load_gold_standard(csv_path: Path) -> list[dict]:
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        row["title"] = (row.get("title") or "").strip()
        row["description"] = (row.get("description") or "").strip()
        row["termURI"] = (row.get("termURI") or "").strip()
    return rows


def load_candidates_for_row(
    results_dir: Path,
    row_index: int,
    title: str,
    gold_iri: str | None = None,
) -> pd.DataFrame:
    """
    Load and merge the zooma/tib/ontobee result files saved for one CSV row.
    Deduplicates by IRI.

    If the exact expected filename is not found, falls back to:
      - any file with the same row index and service
      - any file with the same slug and service
    """
    slug = slugify(title)
    seen_iris: set[str] = set()
    records: list[dict] = []
    loaded_services: list[str] = []

    for service in SERVICES:
        exact_path = results_dir / f"{row_index}__{slug}__{service}.json"
        path = exact_path

        if not path.exists():
            # Fallback 1: same row index, any slug
            row_matches = sorted(results_dir.glob(f"{row_index}__*_{service}.json"))
            if row_matches:
                path = row_matches[0]
                print(
                    f"  [warn] row {row_index}: used row-fallback for {service}: {path.name}",
                    file=sys.stderr,
                )

        if not path.exists():
            # Fallback 2: same slug, any row
            slug_matches = sorted(results_dir.glob(f"*__{slug}__{service}.json"))
            if slug_matches:
                path = slug_matches[0]
                print(
                    f"  [warn] row {row_index}: used slug-fallback for {service}: {path.name}",
                    file=sys.stderr,
                )

        if not path.exists():
            print(
                f"  [warn] missing results file for row {row_index} ({service}): "
                f"{exact_path.name} not found",
                file=sys.stderr,
            )
            continue

        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print(
                f"  [warn] could not parse {path} as JSON — skipping",
                file=sys.stderr,
            )
            continue

        if not payload.get("success", True) or "results" not in payload:
            print(
                f"  [warn] {service} returned an error for row {row_index}: "
                f"{payload.get('error')}",
                file=sys.stderr,
            )
            continue

        term_results = payload.get("results") or []
        mappings = term_results[0].get("mappings", []) if term_results else []

        loaded_services.append(service)

        for m in mappings:
            iri = m.get("Mapped Term IRI") or ""
            if not iri or iri in seen_iris:
                continue
            seen_iris.add(iri)
            records.append(
                {
                    "IRI": iri,
                    "Title": m.get("Class Name") or m.get("Mapped Term Label") or "",
                    "Definition": m.get("Class Definition") or "",
                    "Ontology": m.get("Detailed Ontology")
                    or m.get("Mapped Term Ontology")
                    or "",
                    "Source": service,
                }
            )

    df = pd.DataFrame.from_records(
        records, columns=["IRI", "Title", "Definition", "Ontology", "Source"]
    )

    if gold_iri:
        present = (not df.empty) and (gold_iri in set(df["IRI"]))
        print(
            f"  [debug] row {row_index}: loaded {loaded_services or 'no services'}; "
            f"{len(df)} candidates; gold IRI {'present' if present else 'NOT present'}",
            file=sys.stderr,
        )

    return df


# ── Reranking pipeline ────────────────────────────────────────────────────────
#
# Same scoring logic as ontology_reranking_colab.py: a BM25 lexical pass to
# rank candidates (no pre‑filtering), then a weighted blend of exact-match,
# lexical similarity, semantic similarity, BM25, and token overlap.
#
# NEW SEMANTIC SCORING (replaces the old 4-way term/description x
# title/definition comparison):
#
#   INPUT:      Term + Description combined into one string
#   CANDIDATE:  Title + Definition combined into one string
#
#   ONE semantic comparison is made per candidate, e.g.
#
#       "Assay" + input description
#                     VS
#       "Bioassay" + candidate definition


def tokenize(text) -> list[str]:
    return re.findall(r"[a-z0-9]+", str(text).lower())


def normalize(values) -> np.ndarray:
    values = np.array(values, dtype=float)
    if len(values) == 0:
        return values
    if values.max() == values.min():
        return np.ones(len(values))
    return (values - values.min()) / (values.max() - values.min())


def exact_match(term, title) -> float:
    term = str(term).lower().strip()
    title = str(title).lower().strip()
    if term == title:
        return 1.0
    if term in title or title in term:
        return 0.8
    return 0.0


def lexical_similarity(term, title) -> float:
    return ratio(str(term), str(title)) / 100.0


def jaccard(a, b) -> float:
    a_tokens = set(tokenize(a))
    b_tokens = set(tokenize(b))
    if not a_tokens or not b_tokens:
        return 0.0
    return len(a_tokens & b_tokens) / len(a_tokens | b_tokens)


def retrieve_candidates(
    query: str, candidates: pd.DataFrame, top_n: int | None = None
) -> pd.DataFrame:
    """
    Compute BM25 scores for all candidates and return them sorted by BM25.
    If top_n is None (or >= number of candidates), returns **all** candidates.
    Otherwise keeps only the top_n (legacy behaviour, not used by default).
    """
    documents = [
        tokenize(str(row.Title) + " " + str(row.Definition))
        for _, row in candidates.iterrows()
    ]
    bm25 = BM25Okapi(documents)
    scores = bm25.get_scores(tokenize(query))

    candidates = candidates.copy()
    candidates["bm25_raw"] = scores

    if top_n is None or top_n >= len(candidates):
        return candidates.sort_values("bm25_raw", ascending=False)

    return candidates.sort_values("bm25_raw", ascending=False).head(top_n)


def semantic_score_new(
    model: SentenceTransformer, term, description, title, definition
) -> float:
    """
    Single combined semantic comparison:

        (Term + Description)  vs  (Title + Definition)

    replacing the previous four separate term/description x
    title/definition comparisons.
    """
    input_text = f"{term} {description}".strip()
    candidate_text = f"{title} {definition}".strip()

    emb = model.encode([input_text, candidate_text])
    score = cosine_similarity([emb[0]], [emb[1]])[0][0]

    # Convert cosine similarity from [-1, 1] to [0, 1]
    return (score + 1) / 2


def rerank(
    model: SentenceTransformer, term: str, description: str, candidates: pd.DataFrame
) -> pd.DataFrame:
    candidates = candidates.copy()

    # ── 1. New semantic score: (Term + Description) vs (Title + Definition) ──
    candidates["semantic_score"] = [
        semantic_score_new(model, term, description, row.Title, row.Definition)
        for _, row in candidates.iterrows()
    ]

    # ── 2. Supporting lexical / exact-match / overlap features ──────────────
    candidates["title_match"] = [exact_match(term, x) for x in candidates.Title]
    candidates["lexical_similarity"] = [
        lexical_similarity(term, x) for x in candidates.Title
    ]
    candidates["overlap"] = [jaccard(description, d) for d in candidates.Definition]

    # ── 3. Normalized BM25 score ─────────────────────────────────────────────
    candidates["bm25_score"] = normalize(candidates.bm25_raw.values)

    # ── 4. Final blended score ───────────────────────────────────────────────
    #
    # With the switch to a single combined semantic comparison, semantic
    # similarity now carries more of the ranking signal, so its weight is
    # increased relative to the old 4-way scheme.
    TITLE_MATCH_WEIGHT = 0.10
    LEXICAL_WEIGHT = 0.10
    SEMANTIC_WEIGHT = 0.50
    BM25_WEIGHT = 0.15
    JACCARD_WEIGHT = 0.15

    candidates["final_score"] = (
        TITLE_MATCH_WEIGHT * candidates.title_match
        + LEXICAL_WEIGHT * candidates.lexical_similarity
        + SEMANTIC_WEIGHT * candidates.semantic_score
        + BM25_WEIGHT * candidates.bm25_score
        + JACCARD_WEIGHT * candidates.overlap
    )

    return candidates.sort_values("final_score", ascending=False)


# ── Averaging ─────────────────────────────────────────────────────────────────


def micro_average(df: pd.DataFrame, col: str) -> tuple[int, int, float]:
    """Pool every row together: one overall hit-rate across all instances."""
    hits = int(df[col].sum())
    total = len(df)
    rate = hits / total if total else 0.0
    return hits, total, rate


def macro_average(df: pd.DataFrame, col: str, group_by: str) -> tuple[float, pd.Series]:
    """
    Per-group hit-rate, then the unweighted mean of those group rates —
    the standard "macro" definition (same idea as macro-F1: average per
    class, then average the per-class scores equally).
    """
    per_group = df.groupby(group_by)[col].mean()
    macro = per_group.mean() if len(per_group) else 0.0
    return macro, per_group


# ── Evaluation ────────────────────────────────────────────────────────────────


def evaluate(
    csv_path: Path,
    results_dir: Path,
    out_path: Path,
    top_n_retrieve: int | None = None,
    macro_group_by: str = "gold_iri",
) -> None:
    gold_rows = load_gold_standard(csv_path)
    print(f"Loaded {len(gold_rows)} gold-standard term(s) from {csv_path}")

    print(f"Loading SentenceTransformer model '{MODEL_NAME}'...")
    model = SentenceTransformer(MODEL_NAME)

    per_term_rows = []
    scored_terms = 0
    skipped_terms = 0

    for row_index, gold in enumerate(gold_rows, start=1):
        title = gold["title"]
        description = gold["description"]
        gold_iri = gold["termURI"]

        if not title or not gold_iri:
            print(
                f"[{row_index}/{len(gold_rows)}] Skipping row with missing title/termURI"
            )
            skipped_terms += 1
            continue

        candidates = load_candidates_for_row(
            results_dir, row_index, title, gold_iri=gold_iri
        )
        if candidates.empty:
            print(
                f'[{row_index}/{len(gold_rows)}] "{title}": no candidates found from any service — counted as a miss'
            )
            per_term_rows.append(
                {
                    "row": row_index,
                    "title": title,
                    "description": description,
                    "gold_iri": gold_iri,
                    "n_candidates": 0,
                    "gold_in_top3": False,
                    "gold_in_top5": False,
                    "gold_rank": None,
                    "top5_titles": "",
                }
            )
            scored_terms += 1
            continue

        query = f"{title} {description}".strip()

        # With top_n=None, retrieve_candidates returns ALL candidates.
        # The BM25 score is still used as a feature in the reranking,
        # but no candidate is dropped before the semantic pass.
        retrieved = retrieve_candidates(query, candidates, top_n=top_n_retrieve)
        ranked = rerank(model, title, description, retrieved)

        top5 = ranked.head(5)
        top3_iris = set(top5.head(3)["IRI"])
        top5_iris = set(top5["IRI"])

        in_top3 = gold_iri in top3_iris
        in_top5 = gold_iri in top5_iris

        gold_rank = None
        iri_list = list(ranked["IRI"])
        if gold_iri in iri_list:
            gold_rank = iri_list.index(gold_iri) + 1  # 1-based

        scored_terms += 1

        # Clarified reporting: distinguish between gold missing from
        # services vs. gold missing from final top‑5.
        if in_top3:
            status = "HIT (top-3)"
        elif in_top5:
            status = "hit (top-5)"
        else:
            status = "miss"

        if gold_rank is not None:
            reason = f"gold rank={gold_rank}"
        elif gold_iri in set(candidates["IRI"]):
            reason = "gold was in candidate pool but not in final top-5"
        else:
            reason = "gold not returned by any service"

        print(
            f'[{row_index}/{len(gold_rows)}] "{title}": '
            f"{len(candidates)} candidate(s) -> {status} ({reason})"
        )

        per_term_rows.append(
            {
                "row": row_index,
                "title": title,
                "description": description,
                "gold_iri": gold_iri,
                "n_candidates": len(candidates),
                "gold_in_top3": in_top3,
                "gold_in_top5": in_top5,
                "gold_rank": gold_rank,
                "top5_titles": " | ".join(
                    f"{t} ({i})" for t, i in zip(top5["Title"], top5["IRI"])
                ),
            }
        )

    results_df = pd.DataFrame(per_term_rows)
    results_df.to_csv(out_path, index=False)

    print()
    print("=" * 60)
    print(f"Terms scored:   {scored_terms}")
    print(f"Terms skipped:  {skipped_terms} (missing title/termURI in CSV)")

    if scored_terms > 0:
        top3_hits, top3_total, top3_micro = micro_average(results_df, "gold_in_top3")
        top5_hits, top5_total, top5_micro = micro_average(results_df, "gold_in_top5")

        top3_macro, top3_per_group = macro_average(
            results_df, "gold_in_top3", macro_group_by
        )
        top5_macro, top5_per_group = macro_average(
            results_df, "gold_in_top5", macro_group_by
        )
        n_groups = len(top3_per_group)

        print(f"\nMicro-averaged (per row, {top3_total} rows):")
        print(f"  Top-3 accuracy: {top3_hits}/{top3_total} = {100 * top3_micro:.1f}%")
        print(f"  Top-5 accuracy: {top5_hits}/{top5_total} = {100 * top5_micro:.1f}%")

        print(
            f"\nMacro-averaged (per distinct '{macro_group_by}', {n_groups} groups, equally weighted):"
        )
        print(f"  Top-3 accuracy: {100 * top3_macro:.1f}%")
        print(f"  Top-5 accuracy: {100 * top5_macro:.1f}%")

        breakdown = pd.DataFrame(
            {
                "top3_hit_rate": top3_per_group,
                "top5_hit_rate": top5_per_group,
                "n_rows": results_df.groupby(macro_group_by).size(),
            }
        ).reset_index()
        breakdown_path = out_path.with_name(out_path.stem + "_macro_breakdown.csv")
        breakdown.to_csv(breakdown_path, index=False)
        print(f"\nPer-group breakdown written to: {breakdown_path}")

    print(f"Per-term detail written to: {out_path}")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--csv",
        default="Gold_Standard_Annotations.csv",
        help="Path to the gold-standard CSV",
    )
    parser.add_argument(
        "--results-dir",
        default="backend_results",
        help="Directory produced by query_backend.sh",
    )
    parser.add_argument(
        "--out", default="reranked_results.csv", help="Where to write per-term detail"
    )
    parser.add_argument(
        "--macro-group-by",
        default="gold_iri",
        choices=["gold_iri", "title"],
        help="What to group rows by for macro-averaging (default: gold_iri, the standard "
        "per-class definition — same idea as macro-F1). Use 'title' instead to average "
        "per distinct schema field name.",
    )
    parser.add_argument(
        "--top-n-retrieve",
        type=int,
        default=None,
        help="Maximum number of BM25 candidates to keep before semantic reranking. "
        "Default is None, meaning ALL candidates are kept. "
        "Set a number to re-enable the old pre‑filtering behaviour.",
    )
    args = parser.parse_args()

    evaluate(
        Path(args.csv),
        Path(args.results_dir),
        Path(args.out),
        args.top_n_retrieve,
        args.macro_group_by,
    )


if __name__ == "__main__":
    main()
