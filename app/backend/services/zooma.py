"""
Zooma adapter — EBI Zooma text-to-ontology annotation service.
Docs: https://www.ebi.ac.uk/spot/zooma/docs

Zooma is different in shape from the other adapters: instead of a free-text
search over ontology term labels/definitions, it predicts ontology term
annotations for a given property value based on a corpus of prior curated
mappings, and returns a confidence-ranked list of semantic tag IRIs. It does
not itself return a human-readable label or definition for those IRIs, so —
exactly as EBI's own tools do — each matched IRI is resolved against OLS's
`/api/terms?iri=` lookup to fill in label/definition/ontology for display.

Because Zooma's `/v2/api/services/annotate` endpoint doesn't support
start/rows pagination or report a total count, this adapter fetches once,
then paginates the (typically short) result list itself.
"""

import logging
import requests
from .base import OntologyServiceBase, SearchResult, ChildTerm

_BASE = "https://www.ebi.ac.uk/spot/zooma/v2/api"
_OLS_TERMS = "https://www.ebi.ac.uk/ols4/api/terms"
_REQUEST_TIMEOUT = 30

# Zooma reports a qualitative confidence rather than a numeric score.
# Map it onto the same 0-1 range the rest of the app expects for `Score`.
_CONFIDENCE_SCORE = {"HIGH": 1.0, "GOOD": 0.75, "MEDIUM": 0.5, "LOW": 0.25}

_logger = logging.getLogger(__name__)


def _coerce_str(value) -> str:
    if isinstance(value, list):
        return value[0] if value else ""
    return value or ""


def _resolve_term(iri: str) -> dict:
    """
    Best-effort lookup of label/definition/ontology for a semantic tag IRI,
    via the same OLS instance the OLS adapter uses. Zooma itself has no
    concept of a definition, so this is what fills that field in for display.
    Failures here are non-fatal — the result still gets returned, just with
    a bare label derived from the IRI.
    """
    try:
        resp = requests.get(_OLS_TERMS, params={"iri": iri}, timeout=10)
        resp.raise_for_status()
        terms = resp.json().get("_embedded", {}).get("terms", [])
        return terms[0] if terms else {}
    except Exception as e:
        _logger.debug("Zooma: OLS label lookup failed for %r: %s", iri, e)
        return {}


def _label_from_iri(iri: str) -> str:
    return iri.rsplit("/", 1)[-1].rsplit("#", 1)[-1] if iri else iri


class ZoomaService(OntologyServiceBase):
    name = "zooma"

    def search(
        self,
        term: str,
        ontologies: list[str],
        rows: int = 10,
        start: int = 0,
        **_,  # absorb service-specific kwargs from the generic route
    ) -> tuple[list[SearchResult], int]:
        params = {"propertyValue": term}
        if ontologies:
            params["filter"] = "ontologies:[" + ",".join(o.lower() for o in ontologies) + "]"

        resp = requests.get(
            f"{_BASE}/services/annotate", params=params, timeout=_REQUEST_TIMEOUT
        )
        resp.raise_for_status()
        summaries = resp.json() or []

        results: list[SearchResult] = []
        for summary in summaries:
            tags = summary.get("semanticTags") or []
            if not tags:
                continue
            iri = tags[0]
            confidence = (summary.get("confidence") or "").upper()

            term_info = _resolve_term(iri)
            label = term_info.get("label") or _label_from_iri(iri)
            definition = _coerce_str(term_info.get("description", ""))
            ontology_name = term_info.get("ontology_name", "")
            short_form = term_info.get("short_form", "")

            extra = {}
            if confidence:
                extra["Zooma Confidence"] = confidence

            results.append(
                SearchResult(
                    iri=iri,
                    label=label,
                    ontology_name=ontology_name,
                    definition=definition,
                    short_form=short_form,
                    is_defining_ontology=term_info.get("is_defining_ontology", False),
                    score=_CONFIDENCE_SCORE.get(confidence, 0.0),
                    source="Zooma",
                    extra=extra,
                )
            )

        total = len(results)
        return results[start:start + rows], total

    def get_children(
        self,
        ontology_id: str,
        iri: str,
        lang: str = "en",
    ) -> list[ChildTerm]:
        # Zooma is a flat annotation-prediction service with no ontology
        # hierarchy endpoint of its own.
        return []
