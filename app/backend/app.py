import os

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

from services import get_service, service_names
from services.ols import OLSService
from similarity import score_mappings, warm_up

app = Flask(__name__)
CORS(app)

# Warm up the sentence-transformer model at process startup instead of
# lazily on the first incoming request, so first-request latency isn't
# inflated by model load time. Runs once per worker process at import time
# (works for `python app.py`, `flask run`, and gunicorn/uwsgi alike).
app.logger.info("Warming up similarity model...")
warm_up()
app.logger.info("Similarity model ready.")


# ── Helpers ──────────────────────────────────────────────────────────────────


def _parse_ontologies(target_ontology: str) -> list[str]:
    if not target_ontology or target_ontology.lower() == "all":
        return []
    return [o.strip() for o in target_ontology.split(",") if o.strip()]


def _service_error(name: str):
    return (
        jsonify(
            {
                "success": False,
                "error": f"Unknown service '{name}'. Available: {service_names()}",
                "results": [],
            }
        ),
        400,
    )


# ── Routes ───────────────────────────────────────────────────────────────────


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "healthy",
            "service": "dataverse-annotation-api",
            "registered_services": service_names(),
        }
    )


@app.route("/api/annotate-term", methods=["POST"])
def annotate_term():
    """
    Map one or multiple terms to ontology annotations.

    Body parameters
    ---------------
    terms                    list[str]  – batch of terms (or use `term` for a single one)
    descriptions             list[str]  – optional context for each term (parallel to `terms`)
    target_ontology          str        – comma-separated ontology IDs, or "all"
    rows                     int        – page size  (default 5)
    start                    int        – 0-based offset (default 0)
    service                  str        – which adapter to use (default "ols")
    require_exact_match      bool       – BioPortal: exact label match only (default false)
    also_search_properties   bool       – BioPortal: include property values (default false)

    Response
    --------
    This endpoint only searches — it does not rank. Mappings are returned in
    upstream order, unscored. To rank a result, call /api/score-mapping for
    that individual mapping once it's on screen; each mapping is scored
    independently of the others, in whatever order those requests land.
    """
    try:
        data = request.json or {}

        terms = data.get("terms", [])
        if not terms and "term" in data:
            terms = [data["term"]]

        cleaned = [t.strip() for t in terms if t and isinstance(t, str) and t.strip()]
        if not cleaned:
            return jsonify({"error": "No valid terms provided"}), 400

        # --- Accept descriptions list ---
        descriptions = data.get("descriptions", [])
        # Ensure we have a description for each term; fill with empty string if missing
        if descriptions and len(descriptions) != len(cleaned):
            app.logger.warning(
                "Number of descriptions (%d) does not match number of terms (%d); ignoring descriptions",
                len(descriptions),
                len(cleaned),
            )
            descriptions = [""] * len(cleaned)
        elif not descriptions:
            descriptions = [""] * len(cleaned)

        # Log each term with its context
        for idx, term in enumerate(cleaned):
            desc = descriptions[idx] if idx < len(descriptions) else ""
            app.logger.info(f"Annotating term: {term} | description: {desc}")

        target_ontology = data.get(
            "target_ontology", "EFO,MONDO,HP,GO,UBERON,NCIT,DOID"
        )
        rows = int(data.get("rows", 5))
        start = int(data.get("start", 0))
        service_name = data.get("service", "ols")
        # Service-specific options — ignored by adapters that don't use them
        extra_kwargs = {
            "require_exact_match": bool(data.get("require_exact_match", False)),
            "also_search_properties": bool(data.get("also_search_properties", False)),
        }

        try:
            svc = get_service(service_name)
        except KeyError:
            return _service_error(service_name)

        ontologies = _parse_ontologies(target_ontology)

        # OLS has a dedicated batch method with inter-request rate limiting.
        if isinstance(svc, OLSService):
            formatted = svc.search_batch(cleaned, ontologies, rows, start)
        else:
            formatted = []
            for term in cleaned:
                try:
                    results, total = svc.search(
                        term, ontologies, rows, start, **extra_kwargs
                    )
                    formatted.append(
                        {
                            "term": term,
                            "mappings": [r.to_mapping() for r in results],
                            "total": total,
                        }
                    )
                except Exception as e:
                    app.logger.warning(f"Search error for '{term}': {e}")
                    formatted.append(
                        {"term": term, "mappings": [], "total": 0, "error": str(e)}
                    )

        # Per-term errors (timeouts, upstream failures) are attached to that
        # term's result above so nothing is silently dropped, but a search
        # that comes back empty because it errored looks identical to a
        # search that came back empty because there were genuinely no
        # matches — surface any errors as a warning so the frontend can
        # show the difference instead of implying "no results found".
        term_errors = [
            f"{r['term']}: {r['error']}" for r in formatted if r.get("error")
        ]
        warning = "; ".join(term_errors) if term_errors else None

        return jsonify(
            {
                "success": True,
                "mapper": service_name,
                "target_ontology": target_ontology,
                "rows": rows,
                "start": start,
                "results": formatted,
                "total_terms": len(cleaned),
                "terms_with_mappings": sum(1 for r in formatted if r["mappings"]),
                "warning": warning,
            }
        )

    except Exception as e:
        app.logger.error(f"Error in annotate_term: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e), "results": []}), 500


@app.route("/api/score-mapping", methods=["POST"])
def score_mapping():
    """
    Rank a single search result against the term/description it was found
    for. Deliberately scores one mapping per request — independently of any
    other mapping — so the frontend can request a rank for each result card
    as soon as it's on screen and fill scores in whichever order the
    responses land, instead of waiting on one combined batch call.

    Body parameters
    ---------------
    term          str   – the term that was searched for
    description   str   – optional context for the term
    mapping       dict  – the mapping to score (as returned by /api/annotate-term)

    Response
    --------
    "Query Match Score"   float 0-1 – how close this mapping's title/definition
                                        is to the searched term/description
    "Query Match Details" dict      – the individual sub-scores behind it
                                        (semantic + lexical + overlap components)
    """
    try:
        data = request.json or {}

        term = data.get("term", "")
        if not term or not isinstance(term, str) or not term.strip():
            return jsonify({"success": False, "error": "No valid term provided"}), 400

        description = data.get("description", "")
        mapping = data.get("mapping")
        if not isinstance(mapping, dict):
            return (
                jsonify({"success": False, "error": "No valid mapping provided"}),
                400,
            )

        scored = score_mappings(term.strip(), description, [dict(mapping)])[0]

        return jsonify(
            {
                "success": True,
                "Query Match Score": scored.get("Query Match Score"),
                "Query Match Details": scored.get("Query Match Details"),
            }
        )

    except Exception as e:
        app.logger.error(f"Error in score_mapping: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/hierarchical-children", methods=["GET"])
def get_hierarchical_children():
    """
    Get hierarchical children for a term IRI.

    Query parameters
    ----------------
    ontology_id   str   – ontology identifier
    iri           str   – term IRI (URL-encoded)
    lang          str   – language tag (default "en")
    service       str   – which adapter to use (default "ols")
    parent_label  str   – echoed back in response (optional)
    """
    try:
        ontology_id = request.args.get("ontology_id")
        iri = request.args.get("iri")
        lang = request.args.get("lang", "en")
        service_name = request.args.get("service", "ols")
        parent_label = request.args.get("parent_label", "")

        if not ontology_id or not iri:
            return jsonify({"error": "Missing ontology_id or iri parameter"}), 400

        try:
            svc = get_service(service_name)
        except KeyError:
            return _service_error(service_name)

        children = svc.get_children(ontology_id, iri, lang)

        return jsonify(
            {
                "success": True,
                "children": [c.to_dict() for c in children],
                "total": len(children),
                "ontology_id": ontology_id,
                "parent_iri": iri,
                "parent_label": parent_label,
                "service": service_name,
            }
        )

    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else 502
        msg = (
            f"Term not found in {request.args.get('ontology_id')} ontology."
            if status == 404
            else str(e)
        )
        return (
            jsonify(
                {
                    "success": False,
                    "error": msg,
                    "children": [],
                    "service": request.args.get("service", "ols"),
                }
            ),
            status,
        )
    except EnvironmentError as e:
        return jsonify({"success": False, "error": str(e), "children": []}), 500
    except Exception as e:
        app.logger.error(f"Error in get_hierarchical_children: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e), "children": []}), 500


if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
