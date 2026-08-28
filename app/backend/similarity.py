"""
similarity.py

Scores how closely an ontology mapping returned by an external service
(OLS / BioPortal / TIB) matches the term + description that were used as
the search query.

This is a productionized version of the candidate-reranking logic from the
notebook: instead of reranking a locally-retrieved candidate pool with BM25,
here each mapping already comes back pre-ranked by the external ontology
service, so we only compute the semantic + lexical "closeness" signals and
fold them into a single 0-1 "Query Match Score" per mapping.

Semantic similarity is a single combined comparison — (term + description)
embedded and compared against (title + definition) — rather than four
separate term/description x title/definition comparisons. Combining the
fields into one string per side lets the model weigh which words matter in
context (e.g. a generic term paired with a specific description) instead of
each field being scored in isolation and then hand-weighted back together.
It also halves the number of embeddings computed per mapping.

The sentence-transformer model is loaded once and reused across
requests/terms instead of being reloaded per call. Call `warm_up()` once at
process startup to pay the model-load cost up front rather than on the
first incoming request.

Scoring is intentionally *not* batched across mappings: /api/score-mapping
scores one mapping at a time, independently, so the frontend can fire a
request per search result and update each one as its own response lands —
in whatever order they arrive — rather than waiting on a single combined
batch call.

Adjusting the signal weights
-----------------------------
The "Query Match Score" shown next to every search result is a weighted
blend of four signals (semantic similarity, exact-match, lexical
similarity, definition overlap). All of the weights live in one place:
the local variables inside `_apply_scores()` below —

  * `raw_final` (rescaled into `final_score`) blends `title_match`
    (exact/substring match), `lexical_sim` (fuzzy string similarity),
    `semantic_score` (combined term+description vs. title+definition
    embedding similarity), and `overlap` (definition/description word
    overlap), weighted 0.10 / 0.10 / 0.50 / 0.15.

This mirrors the notebook/evaluation pipeline's own weights
(`score_reranker.py`), minus its BM25 term — there's no local candidate
pool to run BM25 against here, since each mapping is scored on its own as
a single external result — with the remaining weights rescaled back up to
sum to 1 (division by 0.85, the sum of the four non-BM25 weights).

To change how much any signal counts, edit the numbers in `_apply_scores()`
directly — the four weights should still sum to 1 after your edit (adjust
the `/ 0.85` divisor too if they no longer sum to 0.85 before rescaling).
No other file needs to change: the API always reports the same "Query
Match Score" / "Query Match Details" shape, regardless of how the weights
are tuned. Restart the backend (or rebuild the Docker image) after editing
this file for the new weights to take effect.
"""

import re
import threading

from rapidfuzz.fuzz import ratio
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
_model = None
_model_lock = threading.Lock()


def _get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                _model = SentenceTransformer(_MODEL_NAME)
    return _model


def warm_up():
    """
    Eagerly load the sentence-transformer model. Call this once at process
    startup (module import time is fine) so the first real request doesn't
    pay the model-load cost. Safe to call more than once — subsequent calls
    are no-ops since the model is cached.
    """
    _get_model()


def _tokenize(text):
    return re.findall(r"[a-z0-9]+", str(text or "").lower())


def _exact_match(term, title):
    term = str(term or "").lower().strip()
    title = str(title or "").lower().strip()
    if not term or not title:
        return 0.0
    if term == title:
        return 1.0
    if term in title or title in term:
        return 0.8
    return 0.0


def _lexical_similarity(term, title):
    if not term or not title:
        return 0.0
    return ratio(str(term), str(title)) / 100.0


def _jaccard(a, b):
    a_tokens = set(_tokenize(a))
    b_tokens = set(_tokenize(b))
    if not a_tokens or not b_tokens:
        return 0.0
    return len(a_tokens & b_tokens) / len(a_tokens | b_tokens)


def _encode_all(texts):
    """Batch-encode every string needed in a single call."""
    model = _get_model()
    safe_texts = [str(t) if t else "" for t in texts]
    return model.encode(safe_texts, show_progress_bar=False)


def _cos_to_unit(vec_a, vec_b):
    score = cosine_similarity([vec_a], [vec_b])[0][0]
    return float((score + 1) / 2)


def _apply_scores(term, description, mappings, query_emb, candidate_embs):
    """
    Given one term's already-computed embeddings (the combined
    term+description query, and one combined title+definition embedding
    per mapping), compute and attach 'Query Match Score' / 'Query Match
    Details' to every mapping dict. Does not sort — callers sort after
    calling this.
    """
    titles = [m.get("Class Name", "") for m in mappings]
    definitions = [m.get("Class Definition", "") for m in mappings]

    for i, mapping in enumerate(mappings):
        title = titles[i]
        definition = definitions[i]

        # ── Signal weights ──────────────────────────────────────────────
        # See the "Adjusting the signal weights" note in the module
        # docstring at the top of this file before changing any of these.

        # Single combined comparison: (term + description) vs.
        # (title + definition) — replaces the previous four separate
        # term/description x title/definition comparisons.
        semantic_score = _cos_to_unit(query_emb, candidate_embs[i])

        title_match = _exact_match(term, title)
        lexical_sim = _lexical_similarity(term, title)
        overlap = _jaccard(description, definition)

        # Notebook/evaluation pipeline's final_score (score_reranker.py)
        # minus the bm25 term (there's no local candidate pool to rank
        # here — each mapping is a single external result) — remaining
        # weights rescaled to sum to 1.
        raw_final = (
            0.10 * title_match         # exact / substring match on title
            + 0.10 * lexical_sim       # fuzzy string similarity on title
            + 0.50 * semantic_score    # combined semantic similarity (above)
            + 0.15 * overlap           # description/definition word overlap
        )
        final_score = raw_final / 0.85

        mapping["Query Match Score"] = round(float(final_score), 4)
        mapping["Query Match Details"] = {
            "semantic_score": round(semantic_score, 4),
            "title_match": round(title_match, 4),
            "lexical_similarity": round(lexical_sim, 4),
            "definition_overlap": round(overlap, 4),
        }


def score_mappings(term, description, mappings):
    """
    Attach a 'Query Match Score' (0-1, higher = closer) to every mapping in
    `mappings`, measuring how close that specific result's title/definition
    is to the input `term` / `description` (the query actually searched).

    Mutates the mapping dicts in place and returns the same list, in
    whatever order it was passed in — sorting by score is left to the
    frontend (which may combine/dedupe mappings from multiple services
    before deciding on an order).

    Used by /api/score-mapping with a single-item `mappings` list so each
    search result can be scored independently, one request per mapping.
    """
    if not mappings:
        return mappings

    term = term or ""
    description = description or ""

    # One combined string for the query side, one per mapping for the
    # candidate side — see the module docstring for why these are combined
    # into a single comparison rather than compared field-by-field.
    query_text = f"{term} {description}".strip()
    candidate_texts = [
        f"{m.get('Class Name', '')} {m.get('Class Definition', '')}".strip()
        for m in mappings
    ]

    all_texts = [query_text] + candidate_texts
    embeddings = _encode_all(all_texts)

    query_emb = embeddings[0]
    candidate_embs = embeddings[1:]

    _apply_scores(term, description, mappings, query_emb, candidate_embs)

    return mappings
