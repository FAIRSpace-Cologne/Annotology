"""
Service registry
----------------
To add a new ontology service:

1. Create `services/myservice.py` implementing `OntologyServiceBase`.
2. Import and register it below — that's it.

Nothing else in the codebase needs to change.
"""

from .base import OntologyServiceBase
from .ols import OLSService
from .bioportal import BioPortalService
from .tib import TIBService
from .zooma import ZoomaService
from .ontobee import OntobeeService

_REGISTRY: dict[str, OntologyServiceBase] = {}


def _register(service: OntologyServiceBase) -> None:
    _REGISTRY[service.name] = service


# ── Register built-in adapters ───────────────────────────────────────────────
_register(OLSService())
_register(BioPortalService())
_register(TIBService())
_register(ZoomaService())
_register(OntobeeService())
# Add future services here, e.g.:
# from .myservice import MyService
# _register(MyService())


# ── Public API ───────────────────────────────────────────────────────────────


def get_service(name: str) -> OntologyServiceBase:
    svc = _REGISTRY.get(name)
    if svc is None:
        raise KeyError(f"Unknown service '{name}'. Available: {list(_REGISTRY)}")
    return svc


def service_names() -> list[str]:
    return list(_REGISTRY.keys())
