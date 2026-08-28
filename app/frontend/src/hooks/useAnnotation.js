import { useState, useEffect, useRef, useCallback } from 'react';
import { searchService, scoreMapping } from '../services/apiService';
import { resolveServiceKeys } from '../serviceRegistry';

const PAGE_SIZE = 5;

// ── mappingKey ───────────────────────────────────────────────────────────────
//
// Stable identity for a mapping, used both as the React list key and to
// find-and-update a specific mapping in state once its rank comes back.

export function mappingKey(mapping) {
  return `${mapping['Source']}-${mapping['Detailed Ontology']}-${mapping['Mapped Term IRI']}`;
}

// ── useAnnotationStats ─────────────────────────────────────────────────────────

export const useAnnotationStats = (terms, selectedAnnotations, currentTermIndex) => {
  const [stats, setStats] = useState({
    total: 0,
    annotated: 0,
    skipped: 0,
    remaining: 0,
  });

  useEffect(() => {
    if (terms.length > 0) {
      const annotated = Object.keys(selectedAnnotations).length;
      setStats({
        total: terms.length,
        annotated,
        skipped: terms.length - annotated,
        remaining: terms.length - currentTermIndex - 1,
      });
    }
  }, [terms.length, selectedAnnotations, currentTermIndex]);

  return stats;
};

// ── useTermFilter ──────────────────────────────────────────────────────────────

export const useTermFilter = (terms, searchQuery) => {
  const [filteredTerms, setFilteredTerms] = useState([]);

  useEffect(() => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      setFilteredTerms(
        terms.filter(
          t =>
            t.term.toLowerCase().includes(q) ||
            (t.context && t.context.toLowerCase().includes(q))
        )
      );
    } else {
      setFilteredTerms([]);
    }
  }, [searchQuery, terms]);

  return filteredTerms;
};

// ── useMultiServiceAnnotations ───────────────────────────────────────────────
//
// One independent, self-contained result set per active service — no
// cross-service merging or deduplication anywhere in here. Each service's
// search fires as its own request; whichever one comes back first fills in
// its own slot immediately, instead of all services being gated behind the
// slowest one the way a single combined list would be.

const emptyServiceState = () => ({
  mappings: [],
  total: 0,
  start: 0,
  hasMore: true,
  loading: false,
  loadingMore: false,
  error: null,
  warning: null,
});

export const useMultiServiceAnnotations = (
  terms,
  currentTermIndex,
  annotationSettings,
  currentRequestIdRef,
  usedOntologies = []
) => {
  const [resultsByService, setResultsByService] = useState({});
  const [preferredResults, setPreferredResults] = useState(emptyServiceState());

  const activeServiceKeys = resolveServiceKeys(annotationSettings.ontologyService);

  // Always-fresh snapshot of "ontologies already picked from" without
  // forcing fetchAnnotations to be recreated every time the user makes a
  // new selection elsewhere in the app — the ref is written synchronously
  // during render, so by the time any fetch actually runs it reflects
  // whatever was true at that moment.
  const usedOntologiesRef = useRef(usedOntologies);
  usedOntologiesRef.current = usedOntologies;

  // ── Ranking (similarity assessment) ─────────────────────────────────────────
  //
  // Search and ranking are separate requests, scoped to one service's slot
  // of state at a time. This fires one /api/score-mapping call per mapping,
  // all at once (not awaited in sequence), so each mapping's score fills in
  // as soon as its own response lands. Mappings are never reordered by score.

  const rankMappings = useCallback((serviceKey, mappingsToRank, term, description, requestId) => {
    mappingsToRank.forEach((mapping) => {
      const key = mappingKey(mapping);

      scoreMapping(term, description, mapping)
        .then((scored) => {
          if (currentRequestIdRef.current !== requestId) return; // term moved on; discard
          setResultsByService(prev => {
            const slot = prev[serviceKey];
            if (!slot) return prev;
            return {
              ...prev,
              [serviceKey]: {
                ...slot,
                mappings: slot.mappings.map(m =>
                  mappingKey(m) === key ? { ...m, ...scored, _scoring: false } : m
                ),
              },
            };
          });
        })
        .catch((err) => {
          console.error(`Ranking error for "${mapping['Class Name'] || key}" (${serviceKey}):`, err);
          if (currentRequestIdRef.current !== requestId) return;
          setResultsByService(prev => {
            const slot = prev[serviceKey];
            if (!slot) return prev;
            return {
              ...prev,
              [serviceKey]: {
                ...slot,
                mappings: slot.mappings.map(m =>
                  mappingKey(m) === key ? { ...m, _scoring: false } : m
                ),
              },
            };
          });
        });
    });
  }, [currentRequestIdRef]);

  // ── Ranking for the "preferred ontologies" row ───────────────────────────────
  //
  // Same idea as rankMappings above, but scoped to the single merged
  // preferredResults slot instead of one of resultsByService's per-service
  // slots.

  const rankPreferredMappings = useCallback((mappingsToRank, term, description, requestId) => {
    mappingsToRank.forEach((mapping) => {
      const key = mappingKey(mapping);

      scoreMapping(term, description, mapping)
        .then((scored) => {
          if (currentRequestIdRef.current !== requestId) return;
          setPreferredResults(prev => ({
            ...prev,
            mappings: prev.mappings.map(m =>
              mappingKey(m) === key ? { ...m, ...scored, _scoring: false } : m
            ),
          }));
        })
        .catch((err) => {
          console.error(`Ranking error for "${mapping['Class Name'] || key}" (preferred row):`, err);
          if (currentRequestIdRef.current !== requestId) return;
          setPreferredResults(prev => ({
            ...prev,
            mappings: prev.mappings.map(m =>
              mappingKey(m) === key ? { ...m, _scoring: false } : m
            ),
          }));
        });
    });
  }, [currentRequestIdRef]);

  // ── "Preferred ontologies" row ───────────────────────────────────────────────
  //
  // From the second annotated term onward, this pulls one extra row of
  // results — scoped to whichever ontologies the user has already picked
  // terms from — merged across every active service and deduplicated by
  // term URL (unlike the per-service panels below, which are deliberately
  // never deduplicated). It's meant to surface "the ontology you keep
  // using" fast, without the user having to hunt for it across panels.

  const fetchPreferredRow = useCallback((currentTerm, requestId, ontologies, start = 0) => {
    if (!ontologies || ontologies.length === 0) {
      setPreferredResults(emptyServiceState());
      return;
    }

    setPreferredResults(prev => start === 0
      ? { ...emptyServiceState(), loading: true }
      : { ...prev, loadingMore: true });

    const targetOntology = ontologies.join(',');

    Promise.allSettled(
      activeServiceKeys.map(key => searchService(
        key,
        currentTerm.term,
        currentTerm.context,
        {
          targetOntology,
          requireExactMatch: annotationSettings.requireExactMatch,
          alsoSearchProperties: annotationSettings.alsoSearchProperties,
          rows: PAGE_SIZE,
          start,
        },
        requestId,
        currentRequestIdRef
      ))
    ).then((settled) => {
      if (currentRequestIdRef.current !== requestId) return;

      const warnings = [];
      const merged = [];
      settled.forEach((result) => {
        if (result.status === 'fulfilled') {
          merged.push(...result.value.mappings);
          if (result.value.warning) warnings.push(result.value.warning);
        } else {
          warnings.push(result.reason?.message || 'One service failed');
        }
      });

      // Deduplicate by term URL — this row's whole point is "one clean
      // list of the ontologies you already use", so unlike the per-service
      // panels, seeing the same IRI twice here would defeat the purpose.
      setPreferredResults(prev => {
        const seenIris = new Set(start === 0 ? [] : prev.mappings.map(m => m['Mapped Term IRI']));
        const uniqueNew = [];
        merged.forEach(m => {
          const iri = m['Mapped Term IRI'];
          if (!iri || seenIris.has(iri)) return;
          seenIris.add(iri);
          uniqueNew.push(m);
        });
        const pendingNew = uniqueNew.map(m => ({ ...m, _scoring: true }));
        const mergedMappings = start === 0 ? pendingNew : [...prev.mappings, ...pendingNew];

        if (pendingNew.length > 0) {
          rankPreferredMappings(pendingNew, currentTerm.term, currentTerm.context, requestId);
        }

        return {
          mappings: mergedMappings,
          total: mergedMappings.length,
          start,
          // Cross-service pagination has no single reliable "more available"
          // signal, so this is a heuristic: keep offering more only while a
          // page actually yielded new, unique results.
          hasMore: pendingNew.length > 0,
          loading: false,
          loadingMore: false,
          error: null,
          warning: warnings.length ? warnings.join('; ') : null,
        };
      });
    }).catch((err) => {
      if (currentRequestIdRef.current !== requestId) return;
      console.error('Preferred-ontologies row failed:', err);
      setPreferredResults({ ...emptyServiceState(), loading: false, error: err.message });
    });
  }, [activeServiceKeys, annotationSettings.requireExactMatch, annotationSettings.alsoSearchProperties, rankPreferredMappings, currentRequestIdRef]);

  const loadMorePreferredRow = useCallback(() => {
    const currentTerm = terms[currentTermIndex];
    if (!currentTerm || preferredResults.loadingMore || !preferredResults.hasMore) return;
    const requestId = currentRequestIdRef.current;
    fetchPreferredRow(currentTerm, requestId, usedOntologiesRef.current, preferredResults.start + PAGE_SIZE);
  }, [terms, currentTermIndex, preferredResults, fetchPreferredRow, currentRequestIdRef]);

  // ── Per-service search ───────────────────────────────────────────────────────

  const searchOneService = useCallback((serviceKey, currentTerm, requestId) => {
    setResultsByService(prev => ({ ...prev, [serviceKey]: { ...emptyServiceState(), loading: true } }));

    searchService(
      serviceKey,
      currentTerm.term,
      currentTerm.context,
      {
        targetOntology: annotationSettings.targetOntology,
        requireExactMatch: annotationSettings.requireExactMatch,
        alsoSearchProperties: annotationSettings.alsoSearchProperties,
        rows: PAGE_SIZE,
        start: 0,
      },
      requestId,
      currentRequestIdRef
    )
      .then((result) => {
        if (currentRequestIdRef.current !== requestId) return;

        const pendingMappings = result.mappings.map(m => ({ ...m, _scoring: true }));
        setResultsByService(prev => ({
          ...prev,
          [serviceKey]: {
            ...emptyServiceState(),
            mappings: pendingMappings,
            total: result.total,
            start: 0,
            hasMore: result.mappings.length >= PAGE_SIZE && result.total > PAGE_SIZE,
            loading: false,
            warning: result.warning || null,
          },
        }));

        rankMappings(serviceKey, pendingMappings, currentTerm.term, currentTerm.context, requestId);
      })
      .catch((err) => {
        if (currentRequestIdRef.current !== requestId) return;
        console.error(`Annotation error (${serviceKey}):`, err);
        const message = err.response?.data?.error || err.message || 'Failed to fetch annotations';
        setResultsByService(prev => ({
          ...prev,
          [serviceKey]: { ...emptyServiceState(), loading: false, error: message },
        }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationSettings.targetOntology, annotationSettings.requireExactMatch, annotationSettings.alsoSearchProperties, rankMappings, currentRequestIdRef]);

  // ── Initial / refresh fetch — kicks off one independent request per active
  //    service. Nothing here waits on anything else; each service's own
  //    .then() above is what updates that service's slot.

  const fetchAnnotations = useCallback(() => {
    const currentTerm = terms[currentTermIndex];
    if (!currentTerm) return;

    const requestId = Date.now();
    currentRequestIdRef.current = requestId;

    const keys = resolveServiceKeys(annotationSettings.ontologyService);

    // Reset to exactly the active set — any service switched off since the
    // last search has its stale panel cleared, not just left showing old data.
    setResultsByService(
      Object.fromEntries(keys.map(k => [k, { ...emptyServiceState(), loading: true }]))
    );

    keys.forEach(key => searchOneService(key, currentTerm, requestId));
    fetchPreferredRow(currentTerm, requestId, usedOntologiesRef.current, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terms, currentTermIndex, annotationSettings.ontologyService, searchOneService, fetchPreferredRow, currentRequestIdRef]);

  // ── Load-more (infinite scroll), scoped to one service ──────────────────────

  const loadMoreForService = useCallback((serviceKey) => {
    const currentTerm = terms[currentTermIndex];
    const slot = resultsByService[serviceKey];
    if (!currentTerm || !slot || slot.loadingMore || !slot.hasMore) return;

    const requestId = currentRequestIdRef.current;
    const nextStart = slot.start + PAGE_SIZE;

    setResultsByService(prev => ({
      ...prev,
      [serviceKey]: { ...prev[serviceKey], loadingMore: true },
    }));

    searchService(
      serviceKey,
      currentTerm.term,
      currentTerm.context,
      {
        targetOntology: annotationSettings.targetOntology,
        requireExactMatch: annotationSettings.requireExactMatch,
        alsoSearchProperties: annotationSettings.alsoSearchProperties,
        rows: PAGE_SIZE,
        start: nextStart,
      },
      requestId,
      currentRequestIdRef
    )
      .then((result) => {
        if (currentRequestIdRef.current !== requestId) return;

        setResultsByService(prev => {
          const prevSlot = prev[serviceKey];
          if (!prevSlot) return prev;

          const existingIris = new Set(prevSlot.mappings.map(m => m['Mapped Term IRI']));
          const seenInPage = new Set();
          const newUnique = result.mappings.filter(m => {
            const iri = m['Mapped Term IRI'];
            if (!iri || existingIris.has(iri) || seenInPage.has(iri)) return false;
            seenInPage.add(iri);
            return true;
          });
          const newPending = newUnique.map(m => ({ ...m, _scoring: true }));
          const mergedMappings = [...prevSlot.mappings, ...newPending];

          if (newPending.length > 0) {
            rankMappings(serviceKey, newPending, currentTerm.term, currentTerm.context, requestId);
          }

          return {
            ...prev,
            [serviceKey]: {
              ...prevSlot,
              mappings: mergedMappings,
              start: nextStart,
              hasMore: newPending.length > 0 && mergedMappings.length < result.total,
              loadingMore: false,
            },
          };
        });
      })
      .catch((err) => {
        console.error(`Error loading more annotations (${serviceKey}):`, err);
        if (currentRequestIdRef.current !== requestId) return;
        setResultsByService(prev => ({
          ...prev,
          [serviceKey]: { ...prev[serviceKey], hasMore: false, loadingMore: false },
        }));
      });
  }, [terms, currentTermIndex, resultsByService, rankMappings, currentRequestIdRef,
      annotationSettings.targetOntology, annotationSettings.requireExactMatch, annotationSettings.alsoSearchProperties]);

  return {
    resultsByService,
    activeServiceKeys,
    preferredResults,
    hasPreferredRow: usedOntologies.length > 0,
    fetchAnnotations,
    loadMoreForService,
    loadMorePreferredRow,
  };
};

// ── useInfiniteScroll ──────────────────────────────────────────────────────────
//
// Self-contained per-panel infinite scroll: each service's result panel uses
// this with its own container ref, so scrolling within one small service
// list only ever loads more for that service.

export const useInfiniteScroll = (
  containerRef,
  hasMoreResults,
  isLoadingMore,
  currentMappingsLength,
  onLoadMore
) => {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const nearBottom = scrollTop + clientHeight >= scrollHeight - 100;
      if (nearBottom && !isLoadingMore && hasMoreResults && currentMappingsLength > 0) {
        onLoadMore();
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isLoadingMore, hasMoreResults, currentMappingsLength, onLoadMore, containerRef]);
};