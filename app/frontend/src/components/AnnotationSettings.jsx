import React from 'react';
import {
  SERVICE_REGISTRY,
  ALL_SERVICE_KEYS,
  resolveServiceKeys,
  activeCapabilities,
} from '../serviceRegistry';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Given the current ontologyService value (string | string[]), return a Set
 * of the active service keys for O(1) membership checks.
 */
function activeSet(ontologyService) {
  return new Set(resolveServiceKeys(ontologyService));
}

/**
 * Toggle a single service key in/out of the active set and return the new
 * value to store in annotationSettings.ontologyService.
 *
 * Rules:
 *   - If the result would be a single key, store a plain string (backwards-
 *     compatible with any code that still does === 'ols').
 *   - If multiple keys, store an array.
 *   - Never allow an empty selection — ignore the toggle if it would clear all.
 */
function toggleServiceKey(currentOntologyService, key) {
  const current = new Set(resolveServiceKeys(currentOntologyService));
  if (current.has(key)) {
    if (current.size === 1) return currentOntologyService; // keep at least one
    current.delete(key);
  } else {
    current.add(key);
  }
  const result = [...current];
  return result.length === 1 ? result[0] : result;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Per-service info blurb shown when that service is active.
 * Reads everything from the registry — no hardcoded strings.
 */
function ServiceInfoBlurb({ serviceKey }) {
  const svc = SERVICE_REGISTRY[serviceKey];
  if (!svc) return null;

  const colorMap = {
    ols: { bg: 'bg-cobalt-50', border: 'border-cobalt-200', text: 'text-cobalt-800' },
    bioportal: { bg: 'bg-blossom-50', border: 'border-blossom-200', text: 'text-blossom-800' },
    tib: { bg: 'bg-citrus-50', border: 'border-citrus-200', text: 'text-citrus-800' },
  };
  // Fall back to a neutral grey for any unregistered future service
  const c = colorMap[serviceKey] ?? {
    bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-800',
  };

  return (
    <div className={`${c.bg} ${c.border} border rounded p-3`}>
      <p className={`text-xs ${c.text}`}>
        <strong>{svc.label}:</strong> {svc.description}
        <br />
        <strong>Infinite Scroll:</strong> Shows 10 results initially, scroll to load more.
      </p>
    </div>
  );
}

/**
 * Settings panel for capabilities that at least one active service supports.
 * Currently: exactMatch and alsoSearchProperties.
 * Rendered only when at least one active service advertises the capability.
 */
function CapabilitySettings({ annotationSettings, setAnnotationSettings, activeKeys }) {
  const caps = activeCapabilities(activeKeys);

  if (!caps.supportsExactMatch && !caps.supportsSearchProperties) return null;

  // Find services that contribute each capability for the label
  const exactMatchServices = activeKeys.filter(k => SERVICE_REGISTRY[k]?.supportsExactMatch);
  const propSearchServices = activeKeys.filter(k => SERVICE_REGISTRY[k]?.supportsSearchProperties);

  const shortNames = (keys) =>
    keys.map(k => SERVICE_REGISTRY[k]?.shortLabel ?? k).join(', ');

  return (
    <div className="space-y-3 p-3 bg-gray-50 border border-gray-200 rounded">
      <h5 className="text-sm font-medium text-gray-700">Search Options</h5>
      <div className="space-y-2">
        {caps.supportsExactMatch && (
          <label className="inline-flex items-center">
            <input
              type="checkbox"
              checked={annotationSettings.requireExactMatch}
              onChange={(e) =>
                setAnnotationSettings({ ...annotationSettings, requireExactMatch: e.target.checked })
              }
              className="form-checkbox text-cobalt-600"
            />
            <span className="ml-2 text-sm text-gray-700">
              Require exact match
              <span className="ml-1 text-xs text-gray-400">
                ({shortNames(exactMatchServices)})
              </span>
            </span>
          </label>
        )}
        {caps.supportsSearchProperties && (
          <label className="inline-flex items-center">
            <input
              type="checkbox"
              checked={annotationSettings.alsoSearchProperties}
              onChange={(e) =>
                setAnnotationSettings({ ...annotationSettings, alsoSearchProperties: e.target.checked })
              }
              className="form-checkbox text-cobalt-600"
            />
            <span className="ml-2 text-sm text-gray-700">
              Also search properties
              <span className="ml-1 text-xs text-gray-400">
                ({shortNames(propSearchServices)})
              </span>
            </span>
          </label>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const AnnotationSettings = ({
  annotationSettings,
  setAnnotationSettings,
  loading,
  settingsAreDirty,
  onApplySettings,
}) => {
  const active = activeSet(annotationSettings.ontologyService);
  const activeKeys = [...active];
  const multipleActive = activeKeys.length > 1;

  return (
    <div className="bg-olive-50 border-b-2 border-olive-300 p-5">
      {/* Header row — always visible, no collapse. Settings were being missed
          when tucked behind an accordion, so this panel is now permanently
          expanded and given strong visual weight. */}
      <div className="flex items-center gap-3 mb-4">
        <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-olive-500 text-white shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </span>
        <div className="flex-1">
          <h3 className="text-base font-bold text-olive-800">Annotation Settings</h3>
          <p className="text-xs text-olive-700">
            These control which ontology services and search rules are used to find matches below.
          </p>
        </div>
        {/* Active service badges */}
        <span className="flex gap-1">
          {activeKeys.map(k => (
            <span
              key={k}
              className="inline-block px-2 py-1 text-xs font-medium rounded bg-white text-olive-700 border border-olive-300"
            >
              {SERVICE_REGISTRY[k]?.shortLabel ?? k}
            </span>
          ))}
        </span>
      </div>

      {/* Unapplied-changes indicator. Placed right at the top of the panel —
          i.e. exactly where the user's eyes already are right after editing
          a setting — instead of only at the bottom next to the Apply
          button, which people were missing entirely. Changes now also
          auto-apply a moment after this appears, so this is reassurance
          rather than a required action. */}
      {settingsAreDirty && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-citrus-100 border border-citrus-400 animate-pulse-slow">
          <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-citrus-600 border-t-transparent animate-spin shrink-0" />
          <p className="text-xs text-olive-900 flex-1">
            <span className="font-semibold">Settings changed —</span> results below will refresh automatically in a moment.
          </p>
          <button
            onClick={onApplySettings}
            className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded bg-olive-600 text-white hover:bg-olive-700"
          >
            Apply Now
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg border border-olive-200 p-4 space-y-4 shadow-sm">

          {/* ── Service selector ───────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Ontology Services
              <span className="ml-1 font-normal text-gray-400">(select one or more)</span>
            </label>
            <div className="flex flex-wrap gap-3">
              {ALL_SERVICE_KEYS.map(key => {
                const svc = SERVICE_REGISTRY[key];
                const checked = active.has(key);
                return (
                  <label
                    key={key}
                    title={svc.description}
                    className={`
                      inline-flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer
                      text-sm transition-colors select-none
                      ${checked
                        ? 'bg-cobalt-50 border-cobalt-400 text-cobalt-800'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-cobalt-300'}
                    `}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() =>
                        setAnnotationSettings({
                          ...annotationSettings,
                          ontologyService: toggleServiceKey(
                            annotationSettings.ontologyService,
                            key
                          ),
                        })
                      }
                    />
                    {/* Checkmark indicator */}
                    <span
                      className={`
                        w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
                        ${checked ? 'bg-cobalt-600 border-cobalt-600' : 'border-gray-400'}
                      `}
                    >
                      {checked && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    {svc.label}
                  </label>
                );
              })}
            </div>
          </div>

          {/* ── Target ontologies + results info ───────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Target Ontologies
              </label>
              <input
                type="text"
                value={annotationSettings.targetOntology}
                onChange={(e) =>
                  setAnnotationSettings({ ...annotationSettings, targetOntology: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-cobalt-500 focus:border-transparent"
                placeholder="EFO,MONDO,HP,GO,NCIT,DOID or leave blank for all"
              />
              <p className="text-xs text-gray-500 mt-1">
                Comma-separated ontology IDs. Leave blank to search all ontologies.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Search Results
              </label>
              <p className="text-sm text-gray-700 mt-2">10 results per page</p>
              <p className="text-xs text-gray-500 mt-1">Scroll down to load more results.</p>
            </div>
          </div>

          {/* ── Capability settings (exactMatch, alsoSearchProperties) ────── */}
          <CapabilitySettings
            annotationSettings={annotationSettings}
            setAnnotationSettings={setAnnotationSettings}
            activeKeys={activeKeys}
          />

          {/* ── Per-service info blurbs ────────────────────────────────────── */}
          {multipleActive ? (
            <div className="bg-gradient-to-r from-sky-500 to-cobalt-50 border border-cobalt-200 rounded p-3">
              <p className="text-xs text-cobalt-800">
                <strong>Multiple services active ({activeKeys.map(k => SERVICE_REGISTRY[k]?.shortLabel ?? k).join(' + ')}):</strong>{' '}
                Each service is queried independently and shown in its own results list below —
                nothing is merged or deduplicated across services.
              </p>
            </div>
          ) : (
            activeKeys.map(k => <ServiceInfoBlurb key={k} serviceKey={k} />)
          )}

          {/* ── Apply button ───────────────────────────────────────────────── */}
          <button
            onClick={onApplySettings}
            disabled={loading}
            className={`w-full px-4 py-2 text-sm rounded transition-colors disabled:bg-gray-400 ${
              settingsAreDirty
                ? 'bg-citrus-600 text-olive-950 font-semibold hover:bg-citrus-700 animate-pulse-slow'
                : 'bg-cobalt-600 text-white hover:bg-cobalt-700'
            }`}
          >
            {loading
              ? 'Applying Changes…'
              : settingsAreDirty
                ? '⚡ Apply Settings & Refresh (unapplied changes)'
                : 'Apply Settings & Refresh'}
          </button>
      </div>
    </div>
  );
};

export default AnnotationSettings;