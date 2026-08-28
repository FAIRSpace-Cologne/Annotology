import os
import requests
from .base import OntologyServiceBase, SearchResult, ChildTerm

_BASE = "https://data.bioontology.org"
_DEFAULT_INCLUDE = "prefLabel,synonym,definition,notation,cui,semanticType"


def _coerce_str(value) -> str:
    if isinstance(value, list):
        return value[0] if value else ""
    return value or ""


def _coerce_list(value) -> list:
    if isinstance(value, str):
        return [value] if value else []
    return value or []


def _offset_to_page(start: int, rows: int) -> int:
    """Convert a 0-based item offset to a 1-based BioPortal page number."""
    return (start // rows) + 1 if rows else 1


def _extract_ontology_name(item: dict) -> str:
    ontology_url = item.get("links", {}).get("ontology", "")
    if "/ontologies/" in ontology_url:
        parts = ontology_url.split("/ontologies/")
        if len(parts) > 1:
            return parts[1].split("/")[0]
    return ""


def _extract_short_form(item: dict) -> str:
    if "short_form" in item:
        return item["short_form"]
    iri = item.get("@id", "")
    return iri.split("/")[-1] if iri else ""


def _normalize_search_result(item: dict) -> SearchResult | None:
    if item.get("obsolete", False):
        return None
    extra = {}
    cui = _coerce_list(item.get("cui"))
    semantic_type = _coerce_list(item.get("semanticType"))
    if cui:
        extra["CUI"] = cui
    if semantic_type:
        extra["Semantic Type"] = semantic_type

    return SearchResult(
        iri=item.get("@id", ""),
        label=item.get("prefLabel", ""),
        ontology_name=_extract_ontology_name(item),
        definition=_coerce_str(item.get("definition", "")),
        synonyms=_coerce_list(item.get("synonym")),
        short_form=_extract_short_form(item),
        is_defining_ontology=True,
        score=item.get("score", 0),
        source="BioPortal",
        extra=extra,
    )


def _normalize_child(item: dict, ontology_id: str) -> ChildTerm | None:
    if item.get("obsolete", False):
        return None
    extra = {}
    cui = _coerce_list(item.get("cui"))
    semantic_type = _coerce_list(item.get("semanticType"))
    if cui:
        extra["cui"] = cui
    if semantic_type:
        extra["semantic_type"] = semantic_type

    return ChildTerm(
        iri=item.get("@id", ""),
        label=item.get("prefLabel", "No label"),
        description=_coerce_str(item.get("definition", "")),
        synonyms=_coerce_list(item.get("synonym")),
        ontology_name=ontology_id,
        ontology_prefix=ontology_id.upper(),
        short_form=_extract_short_form(item),
        obo_id=item.get("obo_id", ""),
        is_obsolete=item.get("obsolete", False),
        is_defining_ontology=True,
        has_children=item.get("hasChildren", False),
        extra=extra,
    )


class BioPortalService(OntologyServiceBase):
    name = "bioportal"

    def _headers(self) -> dict:
        api_key = os.environ.get("BIOPORTAL_API_KEY")
        if not api_key:
            raise EnvironmentError("BIOPORTAL_API_KEY is not set")
        return {
            "Authorization": f"apikey token={api_key}",
            "Accept": "application/json",
        }

    def search(
        self,
        term: str,
        ontologies: list[str],
        rows: int = 10,
        start: int = 0,
        require_exact_match: bool = False,
        also_search_properties: bool = False,
        **_,
    ) -> tuple[list[SearchResult], int]:
        page = _offset_to_page(start, rows)
        params = {
            "q": term,
            "include": _DEFAULT_INCLUDE,
            "page": page,
            "pagesize": rows,
            "require_exact_match": str(require_exact_match).lower(),
            "also_search_properties": str(also_search_properties).lower(),
        }
        if ontologies:
            params["ontologies"] = ",".join(ontologies)

        resp = requests.get(
            f"{_BASE}/search",
            headers=self._headers(),
            params=params,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

        results = []
        for item in data.get("collection", []):
            normalized = _normalize_search_result(item)
            if normalized:
                results.append(normalized)

        total = data.get("totalCount", len(results))
        return results, total

    def get_children(
        self,
        ontology_id: str,
        iri: str,
        lang: str = "en",  # BioPortal doesn't use lang; accepted for interface compat
    ) -> list[ChildTerm]:
        encoded_iri = requests.utils.quote(iri, safe="")
        url = f"{_BASE}/ontologies/{ontology_id}/classes/{encoded_iri}/children"
        params = {
            "page": 1,
            "page_size": 1000,
            "include": "prefLabel,synonym,definition,cui,semanticType",
        }
        resp = requests.get(url, headers=self._headers(), params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        # Upstream may return a bare list or a paginated {collection: [...]}
        items = data if isinstance(data, list) else data.get("collection", [])

        children = []
        for item in items:
            normalized = _normalize_child(item, ontology_id)
            if normalized:
                children.append(normalized)
        return children
