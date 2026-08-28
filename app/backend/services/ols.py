import logging
import time
import requests
from .base import OntologyServiceBase, SearchResult, ChildTerm

_BASE = "https://www.ebi.ac.uk/ols4/api"
_INTER_REQUEST_DELAY = 0.5  # seconds between successive term queries
_SEARCH_TIMEOUT = 120  # seconds — fail fast rather than hang; an unfiltered
# search (empty target_ontology = every ontology OLS hosts) is a much
# heavier query than one scoped to a handful of ontologies, and can be slow
# enough upstream to be worth surfacing quickly as a timeout rather than
# blocking the request (and, on the dev server, every other request) for
# a long time before quietly coming back with zero results.

_logger = logging.getLogger(__name__)


def _coerce_str(value) -> str:
    if isinstance(value, list):
        return value[0] if value else ""
    return value or ""


def _normalize_child(term: dict, ontology_id: str) -> ChildTerm:
    description = _coerce_str(term.get("description", []))
    synonyms = [s for s in term.get("synonyms", []) if s]
    return ChildTerm(
        iri=term.get("iri", ""),
        label=term.get("label", "No label"),
        description=description,
        synonyms=synonyms,
        ontology_name=term.get("ontology_name", ontology_id),
        ontology_prefix=term.get("ontology_prefix", ""),
        short_form=term.get("short_form", ""),
        obo_id=term.get("obo_id", ""),
        is_obsolete=term.get("is_obsolete", False),
        is_defining_ontology=term.get("is_defining_ontology", False),
        has_children=term.get("has_children", False),
        annotation=term.get("annotation", {}),
    )


class OLSService(OntologyServiceBase):
    name = "ols"

    def search(
        self,
        term: str,
        ontologies: list[str],
        rows: int = 10,
        start: int = 0,
        **_,  # absorb service-specific kwargs from the generic route
    ) -> tuple[list[SearchResult], int]:
        params = {
            "q": term,
            "rows": rows,
            "start": start,
            "fieldList": (
                "iri,label,ontology_name,description,score,"
                "short_form,obo_id,type,is_defining_ontology"
            ),
            "exact": False,
            "queryFields": "label,synonym,description",
        }
        if ontologies:
            params["ontology"] = ",".join(ontologies)

        resp = requests.get(f"{_BASE}/search", params=params, timeout=_SEARCH_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        results: list[SearchResult] = []
        total = 0

        response_block = data.get("response", {})
        total = response_block.get("numFound", 0)

        for doc in response_block.get("docs", [])[:rows]:
            iri = doc.get("iri", "")
            if not iri:
                continue

            extra = {}
            if "obo_id" in doc:
                extra["OBO ID"] = doc["obo_id"]
            if "type" in doc:
                extra["Term Type"] = doc["type"]

            results.append(
                SearchResult(
                    iri=iri,
                    label=doc.get("label", ""),
                    ontology_name=doc.get("ontology_name", ""),
                    definition=_coerce_str(doc.get("description", "")),
                    short_form=doc.get("short_form", ""),
                    obo_id=doc.get("obo_id", ""),
                    term_type=doc.get("type", ""),
                    is_defining_ontology=doc.get("is_defining_ontology", False),
                    score=doc.get("score", 0),
                    source="OLS v4",
                    extra=extra,
                )
            )

        return results, total

    def search_batch(
        self,
        terms: list[str],
        ontologies: list[str],
        rows: int = 10,
        start: int = 0,
    ) -> list[dict]:
        """Search multiple terms sequentially with rate-limiting."""
        batch = []
        for i, term in enumerate(terms):
            if i > 0:
                time.sleep(_INTER_REQUEST_DELAY)
            try:
                mappings, total = self.search(term, ontologies, rows, start)
                batch.append(
                    {
                        "term": term,
                        "mappings": [r.to_mapping() for r in mappings],
                        "total": total,
                    }
                )
            except requests.exceptions.Timeout:
                _logger.warning(
                    "OLS search timed out after %ss for %r (ontologies=%r)",
                    _SEARCH_TIMEOUT,
                    term,
                    ontologies or "all",
                )
                batch.append(
                    {
                        "term": term,
                        "mappings": [],
                        "total": 0,
                        "error": (
                            f"OLS search timed out after {_SEARCH_TIMEOUT}s"
                            + (
                                " — try narrowing to specific ontologies"
                                if not ontologies
                                else ""
                            )
                        ),
                    }
                )
            except Exception as e:
                _logger.warning("OLS search failed for %r: %s", term, e)
                batch.append(
                    {"term": term, "mappings": [], "total": 0, "error": str(e)}
                )
        return batch

    def get_children(
        self,
        ontology_id: str,
        iri: str,
        lang: str = "en",
    ) -> list[ChildTerm]:
        double_encoded = requests.utils.quote(iri, safe="")
        url = (
            f"{_BASE}/ontologies/{ontology_id}"
            f"/terms/{double_encoded}/hierarchicalChildren"
        )
        resp = requests.get(url, params={"lang": lang, "size": 1000}, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        children = []
        for term in data.get("_embedded", {}).get("terms", []):
            children.append(_normalize_child(term, ontology_id))
        return children
