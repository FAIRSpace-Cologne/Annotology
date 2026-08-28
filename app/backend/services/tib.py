"""
TIB Terminology Service — V2 API adapter
Base URL: https://api.terminology.tib.eu

Differences from the OLS V1 (/api/search) adapter:
  - Pagination:    page/size (0-based page) instead of start/rows
  - Search fields: searchFields with Lucene boost syntax instead of queryFields
  - Ontology filter: repeated ?ontology= params instead of a comma-joined string
  - IRI encoding:  double URL-encoded in path params
  - Response root: elements[] + totalElements instead of response.docs + numFound
  - Children:      elements[] from V2PagedResponse, not _embedded.terms
  - Entity shape:  flat V2Entity dict — field names match OLS4 conventions
"""

import requests
from .base import OntologyServiceBase, SearchResult, ChildTerm

_BASE = "https://api.terminology.tib.eu/api/v2"

# Default search fields with boost weights matching TIB docs examples.
# label is boosted highest so exact-label hits float to the top.
_DEFAULT_SEARCH_FIELDS = "label^100 synonym^50 description^10 short_form^1"
_DEFAULT_BOOST_FIELDS = "is_defining_ontology^10 label^5 curie^3 shortForm^2"


def _unwrap(value) -> str:
    """
    Unwrap a single TIB V2 field value to a plain string.

    TIB V2 entities can return field values in three shapes:
      - plain string:        "diabetes mellitus"
      - axiom object:        {"type": "reification", "value": "...", "axioms": {...}}
      - language-tagged obj: {"type": "literal", "value": "...", "lang": "en"}

    All three reduce to the "value" key when it's a dict, or the string itself.
    """
    if isinstance(value, dict):
        return str(value.get("value", ""))
    return str(value) if value is not None else ""


def _coerce_str(value) -> str:
    """Coerce any field value shape to a plain string."""
    if isinstance(value, list):
        return _unwrap(value[0]) if value else ""
    if isinstance(value, dict):
        return _unwrap(value)
    return value or ""


def _coerce_list(value) -> list:
    """Coerce any field value shape to a list of plain strings."""
    if value is None:
        return []
    if isinstance(value, str):
        return [value] if value else []
    if isinstance(value, dict):
        unwrapped = _unwrap(value)
        return [unwrapped] if unwrapped else []
    if isinstance(value, list):
        result = []
        for item in value:
            s = _unwrap(item) if isinstance(item, dict) else str(item) if item else ""
            if s:
                result.append(s)
        return result
    return []


def _offset_to_page(start: int, size: int) -> int:
    """Convert a 0-based item offset to a 0-based page number."""
    return start // size if size else 0


def _double_encode(iri: str) -> str:
    """Double URL-encode an IRI for use as a V2 path segment."""
    once = requests.utils.quote(iri, safe="")
    twice = requests.utils.quote(once, safe="")
    return twice


def _extract_short_form(entity: dict) -> str:
    """Best-effort short form from a V2Entity."""
    raw_sf = entity.get("shortForm") or entity.get("short_form")
    if raw_sf:
        return _coerce_str(raw_sf)
    raw_iri = entity.get("iri", "")
    iri = _coerce_str(raw_iri)
    if iri:
        return iri.rsplit("/", 1)[-1].rsplit("#", 1)[-1]
    return ""


def _normalize_search_result(entity: dict) -> SearchResult | None:
    iri = _coerce_str(entity.get("iri", ""))
    if not iri:
        return None
    if entity.get("isObsolete") or entity.get("is_obsolete"):
        return None

    # V2Entity field names differ slightly from OLS V1 Solr docs
    label = _coerce_str(entity.get("label", ""))
    onto_name = _coerce_str(entity.get("ontologyId") or entity.get("ontology_name", ""))
    definition = _coerce_str(entity.get("description") or entity.get("definition", ""))
    synonyms = _coerce_list(entity.get("synonym") or entity.get("synonyms"))
    short_form = _extract_short_form(entity)
    obo_id = _coerce_str(entity.get("obo_id") or entity.get("curie", ""))
    is_defining = bool(
        entity.get("is_defining_ontology") or entity.get("isDefiningOntology")
    )
    term_type = _coerce_str(entity.get("type", ""))

    extra = {}
    if curie := entity.get("curie"):
        extra["CURIE"] = _coerce_str(curie)
    if term_type:
        extra["Term Type"] = term_type

    return SearchResult(
        iri=iri,
        label=label,
        ontology_name=onto_name,
        definition=definition,
        synonyms=synonyms,
        short_form=short_form,
        obo_id=obo_id,
        is_defining_ontology=is_defining,
        term_type=term_type,
        source="TIB Terminology Service",
        extra=extra,
    )


def _normalize_child(entity: dict, ontology_id: str) -> ChildTerm | None:
    iri = _coerce_str(entity.get("iri", ""))
    if not iri:
        return None
    if entity.get("isObsolete") or entity.get("is_obsolete"):
        return None

    label = _coerce_str(entity.get("label", "No label"))
    description = _coerce_str(entity.get("description") or entity.get("definition", ""))
    synonyms = _coerce_list(entity.get("synonym") or entity.get("synonyms"))
    short_form = _extract_short_form(entity)
    obo_id = _coerce_str(entity.get("obo_id") or entity.get("curie", ""))
    onto_name = _coerce_str(
        entity.get("ontologyId") or entity.get("ontology_name", ontology_id)
    )
    is_defining = bool(
        entity.get("is_defining_ontology") or entity.get("isDefiningOntology")
    )
    has_children = bool(entity.get("hasChildren") or entity.get("has_children"))

    return ChildTerm(
        iri=iri,
        label=label,
        description=description,
        synonyms=synonyms,
        ontology_name=onto_name,
        ontology_prefix=onto_name.upper(),
        short_form=short_form,
        obo_id=obo_id,
        is_defining_ontology=is_defining,
        has_children=has_children,
    )


class TIBService(OntologyServiceBase):
    """
    Adapter for the TIB Terminology Service V2 API.

    The V2 /api/v2/entities endpoint is used for search (classes, properties,
    and individuals in one shot).  Hierarchical children use the class-scoped
    /api/v2/ontologies/{onto}/classes/{iri}/hierarchicalChildren endpoint.
    """

    name = "tib"

    def search(
        self,
        term: str,
        ontologies: list[str],
        rows: int = 10,
        start: int = 0,
        require_exact_match: bool = False,
        **_,
    ) -> tuple[list[SearchResult], int]:
        page = _offset_to_page(start, rows)

        # The V2 API takes repeated `ontology` params, not a comma-joined string.
        # requests handles list values by repeating the key automatically.
        params: dict = {
            "page": page,
            "size": rows,
            "search": term,
            "searchFields": _DEFAULT_SEARCH_FIELDS,
            "boostFields": _DEFAULT_BOOST_FIELDS,
            "exactMatch": str(require_exact_match).lower(),
            "includeObsoleteEntities": "false",
            "searchProperties": {},
        }
        if ontologies:
            params["ontology"] = ontologies  # requests will repeat the key

        resp = requests.get(f"{_BASE}/entities", params=params, timeout=45)
        resp.raise_for_status()
        data = resp.json()

        total = int(data.get("totalElements", 0))
        results: list[SearchResult] = []

        for entity in data.get("elements", []):
            normalized = _normalize_search_result(entity)
            if normalized:
                results.append(normalized)

        return results, total

    def get_children(
        self,
        ontology_id: str,
        iri: str,
        lang: str = "en",
    ) -> list[ChildTerm]:
        encoded = _double_encode(iri)
        url = f"{_BASE}/ontologies/{ontology_id}/classes/{encoded}/hierarchicalChildren"

        # Fetch up to 1 000 children in one page — matches existing adapter behaviour
        params = {"page": 0, "size": 1000, "lang": lang, "searchProperties": {}}

        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        children: list[ChildTerm] = []
        for entity in data.get("elements", []):
            normalized = _normalize_child(entity, ontology_id)
            if normalized:
                children.append(normalized)
        return children
