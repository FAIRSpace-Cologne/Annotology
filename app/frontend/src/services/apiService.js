/**
 * ontologyService.js
 *
 * All ontology search now flows through a single registry of service adapters.
 * To add a new service, drop an object into SEARCH_ADAPTERS
 * — nothing else changes.
 *
 * BREAKING CHANGES vs. the original file
 * ───────────────────────────────────────
 * 1. `searchOLS`, `searchBioPortal` and `searchBothServices` have been removed.
 *    Call-sites should use `searchService` (single service) or `searchServices`
 *    (CV-modal convenience search across several services) instead.
 *
 * 2. `searchService`/`searchServices` now expect a `description` (context)
 *    argument as the second parameter.
 *
 * 3. Search and ranking are separate calls. Both return mappings unscored,
 *    in upstream order. Call `scoreMapping` once per mapping to get its
 *    `Query Match Score` / `Query Match Details` — each call ranks that one
 *    mapping independently, so results can be requested and filled in
 *    concurrently, in whatever order they land.
 *
 * 4. There is no cross-service deduplication anywhere in this file. Each
 *    service's results — including its own upstream `total` — are kept and
 *    reported exactly as that service returned them; the same underlying
 *    term appearing under two services is expected and shown twice, once
 *    per service, rather than collapsed into one entry.
 */

import axios from 'axios';
import { API_URL } from '../constants';
import { resolveServiceKeys } from '../serviceRegistry';

// ── Normalisation ─────────────────────────────────────────────────────────────

function normalizeMapping(raw) {
  return {
    'Mapped Term IRI': raw['Mapped Term IRI'] ?? raw.iri ?? '',
    'Mapped Term Label': raw['Mapped Term Label'] ?? raw.label ?? '',
    'Mapped Term Ontology': raw['Mapped Term Ontology'] ?? raw.ontology_name ?? '',
    'Class Name': raw['Class Name'] ?? raw.label ?? '',
    'Class Definition': raw['Class Definition'] ?? raw.definition ?? '',
    'Detailed Ontology': raw['Detailed Ontology'] ?? raw.ontology_name ?? '',
    'Source': raw['Source'] ?? raw.source ?? '',
    'Match Type': raw['Match Type'] ?? '',
    'Is Defining Ontology': raw['Is Defining Ontology'] ?? true,
    'Score': raw['Score'] ?? 0,
    'Short Form': raw['Short Form'] ?? raw.short_form ?? '',
    // How closely this mapping's title/definition matches the term/description
    // that was actually searched for (0-1, higher = closer). Not populated by
    // search — remains 0/null until `scoreMapping` is called for this mapping.
    'Query Match Score': raw['Query Match Score'] ?? 0,
    'Query Match Details': raw['Query Match Details'] ?? null,
    // Full, untouched raw record as returned by the upstream service, kept
    // verbatim so it can be exported alongside the annotation later.
    '_raw': raw,
    ...Object.fromEntries(
      Object.entries(raw).filter(([k]) =>
        !['Mapped Term IRI', 'Mapped Term Label', 'Mapped Term Ontology',
          'Class Name', 'Class Definition', 'Detailed Ontology',
          'Source', 'Match Type', 'Is Defining Ontology', 'Score', 'Short Form',
          'Query Match Score', 'Query Match Details',
          'iri', 'label', 'ontology_name', 'definition', 'source', 'short_form'
        ].includes(k)
      )
    ),
  };
}

// ── Service adapters ──────────────────────────────────────────────────────────
//
// Each adapter now receives `description` alongside `term`.

const SEARCH_ADAPTERS = {

  ols: async ({ term, description, targetOntology, rows = 5, start = 0, currentRequestId, currentRequestIdRef }) => {
    const response = await axios.post(`${API_URL}/api/annotate-term`, {
      terms: [term],
      descriptions: [description],    // send as parallel array
      target_ontology: targetOntology,
      rows,
      start,
      service: 'ols',
    });

    if (isStale(currentRequestId, currentRequestIdRef)) return staleResult();
    if (response.data.success === false) throw new Error(response.data.error);

    const [first] = response.data.results ?? [];
    const rawMappings = first?.mappings ?? [];
    return {
      mappings: rawMappings.map(normalizeMapping),
      total: first?.total ?? 0,
      warning: response.data.warning,
    };
  },

  bioportal: async ({
    term, description, targetOntology, rows = 5, start = 0,
    requireExactMatch = false, alsoSearchProperties = false,
    currentRequestId, currentRequestIdRef,
  }) => {
    const response = await axios.post(`${API_URL}/api/annotate-term`, {
      terms: [term],
      descriptions: [description],
      target_ontology: targetOntology,
      rows,
      start,
      service: 'bioportal',
      require_exact_match: requireExactMatch,
      also_search_properties: alsoSearchProperties,
    });

    if (isStale(currentRequestId, currentRequestIdRef)) return staleResult();
    if (response.data.success === false) throw new Error(response.data.error);

    const [first] = response.data.results ?? [];
    return {
      mappings: (first?.mappings ?? []).map(normalizeMapping),
      total: first?.total ?? 0,
      warning: response.data.warning,
    };
  },

  tib: async ({
    term, description, targetOntology, rows = 5, start = 0,
    requireExactMatch = false,
    currentRequestId, currentRequestIdRef,
  }) => {
    const response = await axios.post(`${API_URL}/api/annotate-term`, {
      terms: [term],
      descriptions: [description],
      target_ontology: targetOntology,
      rows,
      start,
      service: 'tib',
      require_exact_match: requireExactMatch,
    });

    if (isStale(currentRequestId, currentRequestIdRef)) return staleResult();
    if (response.data.success === false) throw new Error(response.data.error);

    const [first] = response.data.results ?? [];
    return {
      mappings: (first?.mappings ?? []).map(normalizeMapping),
      total: first?.total ?? 0,
      warning: response.data.warning,
    };
  },

  zooma: async ({
    term, description, targetOntology, rows = 5, start = 0,
    currentRequestId, currentRequestIdRef,
  }) => {
    const response = await axios.post(`${API_URL}/api/annotate-term`, {
      terms: [term],
      descriptions: [description],
      target_ontology: targetOntology,
      rows,
      start,
      service: 'zooma',
    });

    if (isStale(currentRequestId, currentRequestIdRef)) return staleResult();
    if (response.data.success === false) throw new Error(response.data.error);

    const [first] = response.data.results ?? [];
    return {
      mappings: (first?.mappings ?? []).map(normalizeMapping),
      total: first?.total ?? 0,
      warning: response.data.warning,
    };
  },

  ontobee: async ({
    term, description, targetOntology, rows = 5, start = 0,
    currentRequestId, currentRequestIdRef,
  }) => {
    const response = await axios.post(`${API_URL}/api/annotate-term`, {
      terms: [term],
      descriptions: [description],
      target_ontology: targetOntology,
      rows,
      start,
      service: 'ontobee',
    });

    if (isStale(currentRequestId, currentRequestIdRef)) return staleResult();
    if (response.data.success === false) throw new Error(response.data.error);

    const [first] = response.data.results ?? [];
    return {
      mappings: (first?.mappings ?? []).map(normalizeMapping),
      total: first?.total ?? 0,
      warning: response.data.warning,
    };
  },
};

// ── Staleness helpers ─────────────────────────────────────────────────────────

function isStale(currentRequestId, currentRequestIdRef) {
  return currentRequestIdRef?.current !== currentRequestId;
}

function staleResult() {
  return { mappings: [], total: 0 };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Search exactly one service and return its results untouched — no merging,
 * no deduplication. This is what powers each independent per-service result
 * list: every active service is searched via its own call to this function,
 * and each fills in its own panel as soon as its own response lands.
 *
 * @param {string}   serviceKey           - a key from SEARCH_ADAPTERS / SERVICE_REGISTRY
 * @param {string}   term
 * @param {string}   description          – context for the term (from TSV)
 * @param {object}   config
 * @param {string}   [config.targetOntology]
 * @param {boolean}  [config.requireExactMatch]
 * @param {boolean}  [config.alsoSearchProperties]
 * @param {number}   [config.rows=5]
 * @param {number}   [config.start=0]
 * @param {*}        currentRequestId
 * @param {{ current: * }} currentRequestIdRef
 *
 * @returns {Promise<{mappings: object[], total: number, warning: ?string}>}
 */
export async function searchService(
  serviceKey,
  term,
  description,
  config = {},
  currentRequestId,
  currentRequestIdRef,
) {
  const adapter = SEARCH_ADAPTERS[serviceKey];
  if (!adapter) throw new Error(`Unknown service '${serviceKey}'`);

  const {
    targetOntology,
    requireExactMatch = false,
    alsoSearchProperties = false,
    rows = 5,
    start = 0,
  } = config;

  return adapter({
    term,
    description,
    targetOntology,
    rows,
    start,
    requireExactMatch,
    alsoSearchProperties,
    currentRequestId,
    currentRequestIdRef,
  });
}

/**
 * Search one or more services and return their combined (not deduplicated)
 * results as a single flat list. This exists only for the controlled-
 * vocabulary modal's "search for a specific term" tab, which shows one
 * simple list rather than a panel per service — the main annotation search
 * uses `searchService` independently per service instead.
 *
 * @param {string}   term
 * @param {string}   description          – context for the term (from TSV)
 * @param {object}   config
 * @param {string[]} [config.activeServices]       - service keys to query; omit for all
 * @param {string}   [config.targetOntology]
 * @param {boolean}  [config.requireExactMatch]
 * @param {boolean}  [config.alsoSearchProperties]
 * @param {number}   [config.rows=5]
 * @param {number}   [config.start=0]
 * @param {*}        currentRequestId
 * @param {{ current: * }} currentRequestIdRef
 *
 * @returns {Promise<{mappings: object[], total: number, warning: ?string}>}
 *   `mappings` are unscored and in upstream/arrival order — rank each one with
 *   `scoreMapping` after displaying it. Not deduplicated: the same term found
 *   by two services appears twice, once per service.
 */
export async function searchServices(
  term,
  description,
  config = {},
  currentRequestId,
  currentRequestIdRef,
) {
  const { activeServices, ...rest } = config;

  // `activeServices` may arrive as a single string (e.g. 'ols'), an array of
  // keys, or undefined (search everything). Settings UI deliberately stores
  // a bare string when only one service is active, so this must always be
  // normalized to an array before using array methods on it — otherwise a
  // single-service selection throws (`"ols".filter is not a function`) and
  // the search silently fails.
  const serviceKeys = activeServices
    ? resolveServiceKeys(activeServices).filter(k => SEARCH_ADAPTERS[k])
    : Object.keys(SEARCH_ADAPTERS);

  const requestedKeys = activeServices
    ? (Array.isArray(activeServices) ? activeServices : [activeServices])
    : serviceKeys;
  const unknownKeys = requestedKeys.filter(k => !SEARCH_ADAPTERS[k]);
  if (unknownKeys.length) {
    console.warn(`ontologyService: unknown service keys ignored: ${unknownKeys.join(', ')}`);
  }

  const settled = await Promise.allSettled(
    serviceKeys.map(k => searchService(k, term, description, rest, currentRequestId, currentRequestIdRef))
  );

  if (isStale(currentRequestId, currentRequestIdRef)) return staleResult();

  let allMappings = [];
  let total = 0;
  const warnings = [];

  for (const [i, result] of settled.entries()) {
    if (result.status === 'fulfilled') {
      allMappings.push(...result.value.mappings);
      total += result.value.total;
      if (result.value.warning) warnings.push(result.value.warning);
    } else {
      console.error(`ontologyService: ${serviceKeys[i]} failed:`, result.reason);
      warnings.push(`${serviceKeys[i]}: ${result.reason?.message || 'search failed'}`);
    }
  }

  const warning = warnings.length ? warnings.join('; ') : null;

  return {
    mappings: allMappings,
    total,
    warning,
  };
}

/**
 * Rank a single search result against the term/description it was found
 * for. Deliberately scores one mapping per call — call this once per
 * mapping (not batched) so results can be requested concurrently and each
 * filled in as soon as its own response lands, regardless of the order
 * those responses arrive in.
 *
 * @param {string} term
 * @param {string} description
 * @param {object} mapping - a normalized mapping, as returned by searchServices
 * @returns {Promise<{'Query Match Score': number, 'Query Match Details': object}>}
 */
export async function scoreMapping(term, description, mapping) {
  const response = await axios.post(`${API_URL}/api/score-mapping`, {
    term,
    description,
    mapping,
  });

  if (response.data.success === false) throw new Error(response.data.error);

  return {
    'Query Match Score': response.data['Query Match Score'],
    'Query Match Details': response.data['Query Match Details'],
  };
}

/**
 * Fetch hierarchical children for a term IRI.
 * The `service` parameter maps to the backend service registry key.
 */
export async function fetchHierarchicalChildren(ontologyPrefix, iri, parentLabel, service = 'ols') {
  const encodedIri = encodeURIComponent(iri);

  const response = await axios.get(`${API_URL}/api/hierarchical-children`, {
    params: {
      ontology_id: ontologyPrefix,
      iri: encodedIri,
      lang: 'en',
      parent_label: parentLabel,
      service,
    },
  });

  if (response.data.success && response.data.children) {
    return response.data.children;
  }
  throw new Error(response.data.error || 'No hierarchical children found for this term');
}