/**
 * serviceRegistry.js
 *
 * Frontend source-of-truth for every ontology service the backend exposes.
 * Adding a new service means adding one entry here — nothing else in the
 * frontend needs to change.
 *
 * Shape of each entry
 * ───────────────────
 * key          string   Must match the backend registry key (e.g. 'ols', 'tib')
 * label        string   Human-readable name shown in UI dropdowns / labels
 * shortLabel   string   Abbreviated name for tight spaces (badges, tags)
 * description  string   Tooltip / settings panel description
 *
 * supportsExactMatch        bool  Show "Require exact match" checkbox for this service
 * supportsSearchProperties  bool  Show "Also search properties" checkbox
 *
 * childrenKey  string | null
 *   The service key to use when fetching hierarchical children for a term
 *   that was annotated by this service.  null = service does not support
 *   hierarchical children.
 */

export const SERVICE_REGISTRY = {
    ols: {
        key: 'ols',
        label: 'OLS v4 (EBI)',
        shortLabel: 'OLS',
        description: 'EMBL-EBI Ontology Lookup Service v4 — broad biomedical coverage.',
        supportsExactMatch: true,
        supportsSearchProperties: false,
        childrenKey: 'ols',
    },

    bioportal: {
        key: 'bioportal',
        label: 'BioPortal (NCBO)',
        shortLabel: 'BioPortal',
        description: 'NCBO BioPortal — large biomedical ontology repository. Requires an API key.',
        supportsExactMatch: true,
        supportsSearchProperties: true,
        childrenKey: 'bioportal',
    },

    tib: {
        key: 'tib',
        label: 'TIB Terminology Service',
        shortLabel: 'TIB',
        description: 'TIB Hannover Terminology Service V2 — strong coverage of engineering, chemistry, and earth sciences.',
        supportsExactMatch: true,
        supportsSearchProperties: false,
        childrenKey: 'tib',
    },

    zooma: {
        key: 'zooma',
        label: 'ZOOMA (EBI)',
        shortLabel: 'ZOOMA',
        description: 'EBI ZOOMA — predicts ontology terms from a corpus of prior curated mappings, ranked by confidence rather than text similarity.',
        supportsExactMatch: false,
        supportsSearchProperties: false,
        childrenKey: null,   // ZOOMA has no hierarchy endpoint
    },

    ontobee: {
        key: 'ontobee',
        label: 'Ontobee',
        shortLabel: 'Ontobee',
        description: 'Ontobee — SPARQL-backed linked-data browser for OBO Foundry ontologies.',
        supportsExactMatch: false,
        supportsSearchProperties: false,
        childrenKey: 'ontobee',
    },
};

/** Ordered list of all registered service keys. */
export const ALL_SERVICE_KEYS = Object.keys(SERVICE_REGISTRY);

/**
 * Resolve a raw ontologyService value (string | string[]) to an array of
 * valid service keys, filtering out any that aren't in the registry.
 */
export function resolveServiceKeys(ontologyService) {
    const keys = Array.isArray(ontologyService)
        ? ontologyService
        : [ontologyService];
    return keys.filter(k => SERVICE_REGISTRY[k]);
}

/**
 * Determine which service key to use for fetching hierarchical children,
 * given the `source` field on a selected annotation.
 *
 * Falls back to 'ols' if no match is found and OLS is registered.
 */
export function childrenServiceForAnnotation(annotation) {
    if (!annotation) return 'ols';

    // Match by the service's label or shortLabel against annotation.source
    const entry = Object.values(SERVICE_REGISTRY).find(
        svc =>
            svc.label === annotation.source ||
            svc.shortLabel === annotation.source ||
            svc.key === annotation.source
    );

    return entry?.childrenKey ?? 'ols';
}

/**
 * Return the union of capability flags across an array of active service keys.
 * Used to decide which settings controls to show when multiple services are
 * active simultaneously.
 */
export function activeCapabilities(serviceKeys) {
    const keys = resolveServiceKeys(serviceKeys);
    return {
        supportsExactMatch: keys.some(k => SERVICE_REGISTRY[k]?.supportsExactMatch),
        supportsSearchProperties: keys.some(k => SERVICE_REGISTRY[k]?.supportsSearchProperties),
    };
}