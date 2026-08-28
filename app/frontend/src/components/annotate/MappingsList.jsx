import React, { useState, useMemo, useRef } from 'react';
import { mappingKey, useInfiniteScroll } from '../../hooks/useAnnotation';
import { SERVICE_REGISTRY } from '../../serviceRegistry';

const MappingsList = ({
  resultsByService,
  activeServiceKeys,
  preferredResults,
  hasPreferredRow,
  usedOntologyCounts,
  currentTerm,
  selectedAnnotations,
  onSelectAnnotation,
  onSkipTerm,
  onRefreshAnnotations,
  onLoadMoreForService,
  onLoadMorePreferredRow,
  onCopyToClipboard
}) => {
  const [sortByMatch, setSortByMatch] = useState(false);

  const preferredActive = hasPreferredRow && activeServiceKeys.length > 0;
  const anyLoading = activeServiceKeys.some(k => resultsByService[k]?.loading) || (preferredActive && preferredResults?.loading);
  const allDone = activeServiceKeys.length > 0 && activeServiceKeys.every(k => !resultsByService[k]?.loading) && (!preferredActive || !preferredResults?.loading);
  const totalMappings = activeServiceKeys.reduce(
    (sum, k) => sum + (resultsByService[k]?.mappings.length ?? 0), 0
  );
  const allEmpty = allDone && totalMappings === 0 && (!preferredActive || (preferredResults?.mappings.length ?? 0) === 0);

  return (
    <div className="p-6">
      {/* Header row: title + primary controls (Refresh, Sort by match) live
          top-right of the list, per user feedback that Refresh in particular
          was easy to miss lower down on the page. Sorting applies
          independently within each service's own panel below. */}
      <div className="flex items-start justify-between mb-3 gap-4 flex-wrap">
        <h4 className="font-medium text-gray-700">
          Available Annotations
          {activeServiceKeys.length > 0 && (
            <span className="ml-2 text-xs text-gray-500 font-normal">
              — {activeServiceKeys.length} service{activeServiceKeys.length === 1 ? '' : 's'} searched independently
            </span>
          )}
        </h4>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSortByMatch(s => !s)}
            disabled={totalMappings === 0}
            title="Sort each service's results by match % (highest first). This reorders by an approximate signal — see the note below."
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              sortByMatch
                ? 'bg-citrus-500 border-citrus-600 text-olive-900'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9M3 12h9m-9 4h5M17 4v16m0 0l-4-4m4 4l4-4" />
            </svg>
            {sortByMatch ? 'Sorted by match %' : 'Sort by match %'}
          </button>

          <button
            type="button"
            onClick={onRefreshAnnotations}
            disabled={anyLoading}
            title="Re-run the search on every selected service"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-cobalt-600 text-white shadow-sm hover:bg-cobalt-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className={`w-4 h-4 ${anyLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Single instruction shown once above the lists, instead of repeating
          "click to select" under every card. */}
      {totalMappings > 0 && (
        <p className="text-sm text-gray-500 mb-2">
          👆 Click any card below to select it as the annotation for this value.
        </p>
      )}

      {/* Persistent, plain-language caveat about match %. This is intentionally
          hard to miss since user feedback showed people were trusting the
          score as ground truth. */}
      {totalMappings > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-citrus-50 border border-citrus-300 px-3 py-2 mb-4">
          <span className="text-base leading-none">💡</span>
          <p className="text-xs text-olive-800">
            <span className="font-semibold">About the match % badge:</span> it's an automated, approximate
            estimate of how close each result's definition is to what you searched for — not a verified or
            guaranteed answer. Treat it as a rough hint for sorting through results, not as the basis for
            your decision. Always read the actual definition before selecting a term.
          </p>
        </div>
      )}

      {activeServiceKeys.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No ontology service is selected.</p>
          <p className="text-gray-400 text-sm mt-2">Pick at least one service above in Annotation Settings.</p>
        </div>
      )}

      {/* From the second annotated term onward: one merged, deduplicated row
          pulling from ontologies the user has already picked from, across
          every active service. Shown first so it's the first thing noticed. */}
      {hasPreferredRow && activeServiceKeys.length > 0 && (
        <div className="mb-4">
          <PreferredOntologyPanel
            state={preferredResults}
            ontologies={usedOntologyCounts.map(o => o.ontology)}
            currentTerm={currentTerm}
            selectedAnnotations={selectedAnnotations}
            sortByMatch={sortByMatch}
            onSelectAnnotation={onSelectAnnotation}
            onLoadMore={onLoadMorePreferredRow}
            onCopyToClipboard={onCopyToClipboard}
          />
        </div>
      )}

      {/* One independent, self-contained, vertically scrollable result list
          per active service — no cross-service merging or deduplication.
          Each fills in as soon as its own request completes. */}
      <div className="space-y-4">
        {activeServiceKeys.map(serviceKey => (
          <ServicePanel
            key={serviceKey}
            serviceKey={serviceKey}
            state={resultsByService[serviceKey] || {}}
            currentTerm={currentTerm}
            selectedAnnotations={selectedAnnotations}
            sortByMatch={sortByMatch}
            onSelectAnnotation={onSelectAnnotation}
            onLoadMore={() => onLoadMoreForService(serviceKey)}
            onCopyToClipboard={onCopyToClipboard}
          />
        ))}
      </div>

      {allEmpty && (
        <div className="text-center py-10 mt-2 border-t border-gray-100">
          <div className="text-gray-400 mb-3">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-500 text-lg">No annotations found for this term, in any selected service</p>
          <p className="text-gray-400 text-sm mt-2">Try adjusting search settings or skip to next term</p>
          <div className="mt-6 space-x-3">
            <button
              onClick={onSkipTerm}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              Skip Term
            </button>
            <button
              onClick={onRefreshAnnotations}
              className="px-4 py-2 bg-cobalt-100 text-cobalt-700 rounded hover:bg-cobalt-200"
            >
              Try Different Ontologies
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── "Preferred ontologies" panel ─────────────────────────────────────────────
//
// Visually distinct from the per-service panels below (olive/citrus accent
// instead of plain gray) to signal it's a different kind of row: merged
// across every active service and deduplicated by term URL, scoped to
// whichever ontologies the user has already picked terms from so far.

const PreferredOntologyPanel = ({
  state,
  ontologies,
  currentTerm,
  selectedAnnotations,
  sortByMatch,
  onSelectAnnotation,
  onLoadMore,
  onCopyToClipboard,
}) => {
  const containerRef = useRef(null);
  const { mappings = [], loading, loadingMore, hasMore, error, warning } = state || {};

  useInfiniteScroll(containerRef, !!hasMore, !!loadingMore, mappings.length, onLoadMore);

  const displayedMappings = useMemo(() => {
    if (!sortByMatch) return mappings;
    const withScore = [];
    const withoutScore = [];
    mappings.forEach(m => {
      const score = m['Query Match Score'];
      if (typeof score === 'number') withScore.push(m);
      else withoutScore.push(m);
    });
    withScore.sort((a, b) => (b['Query Match Score'] ?? 0) - (a['Query Match Score'] ?? 0));
    return [...withScore, ...withoutScore];
  }, [mappings, sortByMatch]);

  const ontologyLabel = ontologies.slice(0, 4).join(', ') + (ontologies.length > 4 ? `, +${ontologies.length - 4} more` : '');

  return (
    <div className="border-2 border-olive-300 rounded-xl overflow-hidden bg-olive-50/30">
      <div className="flex items-center justify-between px-4 py-2 bg-olive-100 border-b border-olive-300">
        <div className="flex items-center gap-2 min-w-0">
          <span title="Your most-used ontologies so far">⭐</span>
          <span className="font-semibold text-sm text-olive-900 truncate">
            From ontologies you've already used: {ontologyLabel}
          </span>
          {loading && (
            <span className="inline-block h-3 w-3 rounded-full border-2 border-olive-300 border-t-olive-600 animate-spin shrink-0" />
          )}
        </div>
        {warning && !loading && (
          <span className="text-xs text-amber-700 shrink-0" title={warning}>⚠️ incomplete</span>
        )}
      </div>
      <p className="px-4 pt-2 text-xs text-olive-700">
        Merged across every service you're searching, and deduplicated by term URL — unlike the
        per-service lists below, which intentionally aren't deduplicated.
      </p>

      {error && !loading ? (
        <div className="px-4 py-4 text-sm text-red-700 bg-red-50">
          Search failed: {error}
        </div>
      ) : loading && mappings.length === 0 ? (
        <ServiceSkeleton />
      ) : mappings.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-olive-500">
          No results from {ontologyLabel} for "{currentTerm?.term?.substring(0, 40)}
          {currentTerm?.term?.length > 40 ? '...' : ''}"
        </div>
      ) : (
        <div
          ref={containerRef}
          className="h-56 overflow-y-auto divide-y divide-olive-100"
          style={{ scrollbarWidth: 'thin' }}
        >
          {displayedMappings.map((mapping, idx) => (
            <MappingCard
              key={mappingKey(mapping)}
              mapping={mapping}
              index={idx}
              isSelected={`${selectedAnnotations[currentTerm?.id]?.source}-${selectedAnnotations[currentTerm?.id]?.ontology}-${selectedAnnotations[currentTerm?.id]?.iri}` === mappingKey(mapping)}
              onSelect={() => onSelectAnnotation(mapping)}
              onCopyIRI={() => onCopyToClipboard(mapping['Mapped Term IRI'])}
            />
          ))}

          {loadingMore && (
            <div className="text-center py-3">
              <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-olive-600"></div>
            </div>
          )}

          {!hasMore && mappings.length > 0 && (
            <div className="text-center py-2">
              <p className="text-xs text-olive-400">No more results from these ontologies</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Per-service result panel ─────────────────────────────────────────────────
//
// Fixed, compact height (roughly 2 result rows) with its own internal
// scrollbar and its own infinite-scroll loading — entirely independent of
// every other service's panel.

const ServicePanel = ({
  serviceKey,
  state,
  currentTerm,
  selectedAnnotations,
  sortByMatch,
  onSelectAnnotation,
  onLoadMore,
  onCopyToClipboard,
}) => {
  const containerRef = useRef(null);
  const { mappings = [], total = 0, loading, loadingMore, hasMore, error, warning } = state;
  const label = SERVICE_REGISTRY[serviceKey]?.label ?? serviceKey;

  useInfiniteScroll(containerRef, !!hasMore, !!loadingMore, mappings.length, onLoadMore);

  const displayedMappings = useMemo(() => {
    if (!sortByMatch) return mappings;
    const withScore = [];
    const withoutScore = [];
    mappings.forEach(m => {
      const score = m['Query Match Score'];
      if (typeof score === 'number') withScore.push(m);
      else withoutScore.push(m);
    });
    withScore.sort((a, b) => (b['Query Match Score'] ?? 0) - (a['Query Match Score'] ?? 0));
    return [...withScore, ...withoutScore];
  }, [mappings, sortByMatch]);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-gray-800">{label}</span>
          {loading && (
            <span className="inline-block h-3 w-3 rounded-full border-2 border-gray-300 border-t-cobalt-500 animate-spin" />
          )}
          {!loading && mappings.length > 0 && (
            <span className="text-xs text-gray-500">
              {mappings.length} of {total > 0 ? total : mappings.length} shown
            </span>
          )}
        </div>
        {warning && !loading && (
          <span className="text-xs text-amber-700" title={warning}>⚠️ incomplete</span>
        )}
      </div>

      {error && !loading ? (
        <div className="px-4 py-4 text-sm text-red-700 bg-red-50">
          Search failed: {error}
        </div>
      ) : loading && mappings.length === 0 ? (
        <ServiceSkeleton />
      ) : mappings.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">
          No results from {label} for "{currentTerm?.term?.substring(0, 40)}
          {currentTerm?.term?.length > 40 ? '...' : ''}"
        </div>
      ) : (
        <div
          ref={containerRef}
          className="h-56 overflow-y-auto divide-y divide-gray-100"
          style={{ scrollbarWidth: 'thin' }}
        >
          {displayedMappings.map((mapping, idx) => (
            <MappingCard
              key={mappingKey(mapping)}
              mapping={mapping}
              index={idx}
              isSelected={`${selectedAnnotations[currentTerm?.id]?.source}-${selectedAnnotations[currentTerm?.id]?.ontology}-${selectedAnnotations[currentTerm?.id]?.iri}` === mappingKey(mapping)}
              onSelect={() => onSelectAnnotation(mapping)}
              onCopyIRI={() => onCopyToClipboard(mapping['Mapped Term IRI'])}
            />
          ))}

          {loadingMore && (
            <div className="text-center py-3">
              <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-cobalt-600"></div>
            </div>
          )}

          {!hasMore && mappings.length > 0 && (
            <div className="text-center py-2">
              <p className="text-xs text-gray-400">No more results from {label}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Loading skeleton shown in a service's panel while its request is in
// flight and it has no results yet.
const ServiceSkeleton = () => (
  <div className="h-56 p-4 space-y-3 animate-pulse">
    {[0, 1].map(i => (
      <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-2/3" />
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-5/6" />
      </div>
    ))}
  </div>
);

/**
 * Tailwind classes for the match-score badge, tiered by how close the
 * result is to what was searched for.
 */
function matchScoreBadgeClasses(percent) {
  if (percent >= 75) return 'bg-green-100 text-green-800';
  if (percent >= 50) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

const MappingCard = ({ mapping, index, isSelected, onSelect, onCopyIRI }) => {
  const rawScore = mapping['Query Match Score'];
  const matchPercent = typeof rawScore === 'number' ? Math.round(rawScore * 100) : null;
  const isScoring = !!mapping._scoring;

  return (
    <div
      onClick={onSelect}
      className={`p-4 cursor-pointer transition-all duration-200 hover:bg-gray-50 ${isSelected
        ? 'bg-gradient-to-r from-sky-500 to-cobalt-50 ring-1 ring-inset ring-cobalt-300'
        : 'bg-white'
        }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="px-2 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-800">
              #{index + 1}
            </span>
            <h5 className="font-semibold text-gray-900">
              {mapping['Class Name'] || mapping['Mapped Term Label']}
            </h5>
            {isScoring ? (
              <span
                className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-500 cursor-help"
                title="This term is being assessed for similarity"
              >
                <span className="inline-block h-3 w-3 rounded-full border-2 border-gray-300 border-t-cobalt-500 animate-spin" />
                Assessing…
              </span>
            ) : matchPercent !== null && (
              <span
                className={`px-2 py-1 text-xs font-semibold rounded ${matchScoreBadgeClasses(matchPercent)}`}
                title="Approximate, automatically generated estimate of similarity to your search — not verified. Read the definition yourself before deciding."
              >
                ~{matchPercent}% match
              </span>
            )}
          </div>

          {mapping['Class Definition'] && (
            <div className="mb-2 p-2 bg-gray-50 rounded border border-gray-200">
              <div className="text-sm text-gray-700">
                <span className="font-medium text-gray-600">Definition:</span>
                <span className="ml-2">{mapping['Class Definition']}</span>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center text-sm text-gray-600 flex-wrap gap-1">
              <span className="font-medium mr-1">Ontology:</span>
              <span className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">
                {mapping['Detailed Ontology'] || mapping['Mapped Term Ontology']}
              </span>
              {mapping['Short Form'] && (
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                  {mapping['Short Form']}
                </span>
              )}
            </div>

            <a
              href={mapping['Mapped Term IRI']}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-cobalt-600 hover:text-cobalt-800 break-all flex items-center"
              title="Open in browser"
            >
              <svg className="w-3 h-3 mr-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              {mapping['Mapped Term IRI'].length > 60
                ? mapping['Mapped Term IRI'].substring(0, 60) + '...'
                : mapping['Mapped Term IRI']}
            </a>
          </div>
        </div>
        <div className="ml-3 flex flex-col items-end gap-2 shrink-0">
          {isSelected && (
            <div className="text-green-600">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopyIRI();
            }}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Copy IRI
          </button>
        </div>
      </div>
    </div>
  );
};

export default MappingsList;
