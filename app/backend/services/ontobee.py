"""
Ontobee adapter — SPARQL-backed search over OBO Foundry ontologies.
Docs: https://ontobee.org/tutorial and https://ontobee.org/tutorial/sparql

Ontobee itself is a linked-data browser; the SPARQL endpoint it documents
and is backed by is the HeGroup triplestore, queried directly here:

    http://sparql.hegroup.org/sparql

Per the Ontobee SPARQL tutorial, each ontology is loaded into its own named
graph at:

    http://purl.obolibrary.org/obo/merged/<ONTOLOGY_ID>

e.g. <http://purl.obolibrary.org/obo/merged/EFO> for EFO. Search here is
implemented as a case-insensitive regex match on rdfs:label within the
requested ontologies' named graphs (falling back to a small default set of
common OBO ontologies when none are specified, since an unscoped query
against every graph in the store is prohibitively slow). Definitions use the
OBO standard `IAO_0000115` ("definition") annotation property, which is
what Ontobee's own term pages display as the definition.

Because SPARQL here has no single cross-graph "total" count and each named
graph is queried separately, `total` is the count of *results actually
fetched* across all queried ontologies (a lower bound), not a true upstream
total — the same caveat that applies to Zooma's pagination in this codebase.
"""

import logging
import requests
from .base import OntologyServiceBase, SearchResult, ChildTerm

_SPARQL_ENDPOINT = "http://sparql.hegroup.org/sparql"
_MERGED_GRAPH = "http://purl.obolibrary.org/obo/merged/{}"
_REQUEST_TIMEOUT = 30

# Used when no target ontology is specified ("all"), to keep queries bounded.
_DEFAULT_ONTOLOGIES = ["EFO", "MONDO", "HP", "GO", "UBERON", "NCIT", "DOID"]

_PREFIXES = """
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX obo: <http://purl.obolibrary.org/obo/>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
"""

_logger = logging.getLogger(__name__)


def _escape_sparql_literal(value: str) -> str:
    """Escape a string for safe interpolation into a SPARQL regex literal."""
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _sparql_select(query: str) -> list[dict]:
    resp = requests.get(
        _SPARQL_ENDPOINT,
        params={"query": query, "format": "json"},
        headers={"Accept": "application/sparql-results+json"},
        timeout=_REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get("results", {}).get("bindings", [])


def _binding_str(binding: dict, key: str) -> str:
    return binding.get(key, {}).get("value", "")


class OntobeeService(OntologyServiceBase):
    name = "ontobee"

    def search(
        self,
        term: str,
        ontologies: list[str],
        rows: int = 10,
        start: int = 0,
        **_,  # absorb service-specific kwargs from the generic route
    ) -> tuple[list[SearchResult], int]:
        target_ontologies = [o.upper() for o in ontologies] or _DEFAULT_ONTOLOGIES
        escaped_term = _escape_sparql_literal(term)

        # SPARQL has no simple way to page results merged across several
        # named graphs, so a modest cap is fetched from each ontology and
        # the combined list is sliced to the requested window in Python.
        per_graph_limit = max(start + rows, 25)

        seen_iris: set[str] = set()
        results: list[SearchResult] = []

        for ontology_id in target_ontologies:
            graph = _MERGED_GRAPH.format(ontology_id)
            query = f"""{_PREFIXES}
SELECT DISTINCT ?term ?label ?definition WHERE {{
  GRAPH <{graph}> {{
    ?term rdfs:label ?label .
    OPTIONAL {{ ?term obo:IAO_0000115 ?definition }}
    FILTER (isIRI(?term))
    FILTER (lang(?label) = "" || langMatches(lang(?label), "en"))
    FILTER regex(?label, "{escaped_term}", "i")
  }}
}}
LIMIT {per_graph_limit}
"""
            try:
                bindings = _sparql_select(query)
            except Exception as e:
                _logger.warning(
                    "Ontobee search failed for ontology %r, term %r: %s",
                    ontology_id, term, e,
                )
                continue

            for binding in bindings:
                iri = _binding_str(binding, "term")
                if not iri or iri in seen_iris:
                    continue
                seen_iris.add(iri)
                results.append(
                    SearchResult(
                        iri=iri,
                        label=_binding_str(binding, "label"),
                        ontology_name=ontology_id,
                        definition=_binding_str(binding, "definition"),
                        short_form=iri.rsplit("/", 1)[-1].rsplit("#", 1)[-1],
                        is_defining_ontology=True,
                        source="Ontobee",
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
        graph = _MERGED_GRAPH.format(ontology_id.upper())
        query = f"""{_PREFIXES}
SELECT DISTINCT ?child ?label ?definition WHERE {{
  GRAPH <{graph}> {{
    ?child rdfs:subClassOf <{iri}> .
    ?child rdfs:label ?label .
    OPTIONAL {{ ?child obo:IAO_0000115 ?definition }}
    FILTER (isIRI(?child))
    FILTER NOT EXISTS {{ ?child owl:deprecated true }}
    FILTER (lang(?label) = "" || langMatches(lang(?label), "en"))
  }}
}}
LIMIT 1000
"""
        bindings = _sparql_select(query)

        children: list[ChildTerm] = []
        for binding in bindings:
            child_iri = _binding_str(binding, "child")
            if not child_iri:
                continue
            children.append(
                ChildTerm(
                    iri=child_iri,
                    label=_binding_str(binding, "label") or "No label",
                    description=_binding_str(binding, "definition"),
                    ontology_name=ontology_id,
                    ontology_prefix=ontology_id.upper(),
                    short_form=child_iri.rsplit("/", 1)[-1].rsplit("#", 1)[-1],
                    is_defining_ontology=True,
                )
            )
        return children
