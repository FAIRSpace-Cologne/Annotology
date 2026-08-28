from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class SearchResult:
    """Normalised shape every service adapter must produce."""

    iri: str
    label: str
    ontology_name: str
    definition: str
    synonyms: list[str] = field(default_factory=list)
    short_form: str = ""
    obo_id: str = ""
    term_type: str = ""
    is_defining_ontology: bool = False
    has_children: bool = False
    is_obsolete: bool = False
    score: float = 0.0
    source: str = ""
    # Service-specific extras go here without polluting the core shape
    extra: dict[str, Any] = field(default_factory=dict)

    def to_mapping(self) -> dict:
        """Return the legacy 'Mapped Term *' dict the front-end currently expects."""
        return {
            "Mapped Term IRI": self.iri,
            "Mapped Term Label": self.label,
            "Mapped Term Ontology": self.ontology_name,
            "Class Name": self.label,
            "Class Definition": self.definition,
            "Detailed Ontology": self.ontology_name,
            "Source": self.source,
            "Match Type": "SEARCH_RESULT",
            "Is Defining Ontology": self.is_defining_ontology,
            "Score": self.score,
            "Short Form": self.short_form,
            **self.extra,
        }


@dataclass
class ChildTerm:
    """Normalised shape for hierarchical children."""

    iri: str
    label: str
    description: str
    synonyms: list[str] = field(default_factory=list)
    ontology_name: str = ""
    ontology_prefix: str = ""
    short_form: str = ""
    obo_id: str = ""
    is_obsolete: bool = False
    is_defining_ontology: bool = False
    has_children: bool = False
    annotation: dict = field(default_factory=dict)
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "iri": self.iri,
            "label": self.label,
            "description": self.description,
            "synonyms": self.synonyms,
            "ontology_name": self.ontology_name,
            "ontology_prefix": self.ontology_prefix,
            "short_form": self.short_form,
            "obo_id": self.obo_id,
            "is_obsolete": self.is_obsolete,
            "is_defining_ontology": self.is_defining_ontology,
            "has_children": self.has_children,
            "annotation": self.annotation,
            **self.extra,
        }


class OntologyServiceBase(ABC):
    """
    Contract every service adapter must fulfil.

    Pagination contract
    -------------------
    Internally each adapter may use pages, offsets, cursors — whatever its
    upstream API requires.  Externally it always accepts `rows` (page size)
    and `start` (0-based item offset) and translates them itself.
    """

    name: str  # unique key used in the registry and in API responses

    @abstractmethod
    def search(
        self,
        term: str,
        ontologies: list[str],
        rows: int = 10,
        start: int = 0,
    ) -> tuple[list[SearchResult], int]:
        """
        Return (results, total_count).
        `total_count` is the upstream total, not just len(results).
        """

    @abstractmethod
    def get_children(
        self,
        ontology_id: str,
        iri: str,
        lang: str = "en",
    ) -> list[ChildTerm]:
        """Return all direct hierarchical children of the given term IRI."""
