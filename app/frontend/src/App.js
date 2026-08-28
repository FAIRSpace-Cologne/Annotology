import React, { useState, useEffect, useRef } from 'react';
import { STEPS, DEFAULT_ANNOTATION_SETTINGS, DEFAULT_METADATA_STATE } from './constants';
import {
  extractTermsFromColumn,
  generateAnnotatedContent,
} from './utils/tsvParser';
import { fetchHierarchicalChildren, searchServices } from './services/apiService';
import { childrenServiceForAnnotation, ALL_SERVICE_KEYS, SERVICE_REGISTRY } from './serviceRegistry';
import { useAnnotationStats, useTermFilter, useMultiServiceAnnotations } from './hooks/useAnnotation';
import { ConfirmModal, InfoModal, CVModal } from './components/Modals';
import LoadingOverlay from './components/LoadingOverlay';
import ErrorDisplay from './components/ErrorDisplay';
import UploadStep from './components/UploadStep';
import ExportStep from './components/ExportStep';
import AnnotateStep from './components/AnnotateStep';

function App() {
  const [step, setStep] = useState(STEPS.UPLOAD);
  const [file, setFile] = useState(null);
  const [terms, setTerms] = useState([]);
  const [currentTermIndex, setCurrentTermIndex] = useState(0);
  const [selectedAnnotations, setSelectedAnnotations] = useState({});
  const [annotationSettings, setAnnotationSettings] = useState(DEFAULT_ANNOTATION_SETTINGS);
  const [metadata, setMetadata] = useState(DEFAULT_METADATA_STATE);
  const [cvValues, setCvValues] = useState({});
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [showCVModal, setShowCVModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalConfig, setConfirmModalConfig] = useState({
    title: '', message: '', onConfirm: () => { }, onCancel: () => { },
  });
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoModalConfig, setInfoModalConfig] = useState({ title: '', message: '' });

  // CV Modal state
  const [hierarchicalChildren, setHierarchicalChildren] = useState([]);
  const [selectedCVTerms, setSelectedCVTerms] = useState([]);
  const [isFetchingChildren, setIsFetchingChildren] = useState(false);

  // CV Modal — direct ontology search state (search for terms to add,
  // using the same searchServices API that powers annotation search)
  const [cvSearchQuery, setCvSearchQuery] = useState('');
  const [cvSearchResults, setCvSearchResults] = useState([]);
  const [isSearchingCV, setIsSearchingCV] = useState(false);
  const [cvSearchError, setCvSearchError] = useState(null);

  // Refs
  const currentRequestIdRef = useRef(0);
  const cvSearchRequestIdRef = useRef(0);

  // Custom hooks
  const annotationStats = useAnnotationStats(terms, selectedAnnotations, currentTermIndex);
  const filteredTerms = useTermFilter(terms, searchQuery);
  const [loading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState(null);

  // Tally which ontologies the user has already picked terms from, across
  // every annotation made so far in this session (not just the current
  // term). Used both to show a "your preferred ontologies" summary in the
  // sidebar, and to power the extra results row that surfaces those same
  // ontologies again on later terms.
  const usedOntologyCounts = React.useMemo(() => {
    const counts = {};
    Object.values(selectedAnnotations).forEach(a => {
      const ontology = a.ontology;
      if (!ontology) return;
      counts[ontology] = (counts[ontology] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([ontology, count]) => ({ ontology, count }))
      .sort((a, b) => b.count - a.count);
  }, [selectedAnnotations]);
  const usedOntologyKeys = React.useMemo(
    () => usedOntologyCounts.map(o => o.ontology),
    [usedOntologyCounts]
  );

  const {
    resultsByService,
    activeServiceKeys,
    preferredResults,
    hasPreferredRow,
    fetchAnnotations,
    loadMoreForService,
    loadMorePreferredRow,
  } = useMultiServiceAnnotations(terms, currentTermIndex, annotationSettings, currentRequestIdRef, usedOntologyKeys);

  // ── Settings apply/dirty tracking ────────────────────────────────────────────
  //
  // Users were changing settings (toggling a service, editing target
  // ontologies…) without noticing they still had to click "Apply Settings &
  // Refresh" for it to take effect — the results below silently kept
  // showing the old settings' results. Two things fix that:
  //   1. Settings now auto-apply a short moment after the user stops
  //      editing, so most people never need the button at all.
  //   2. Meanwhile, `settingsAreDirty` drives a visible "unapplied changes"
  //      state (banner + button styling) so the gap between editing and
  //      auto-apply is never silent.
  const [appliedSettingsSnapshot, setAppliedSettingsSnapshot] = useState(() => JSON.stringify(annotationSettings));
  const settingsDebounceRef = useRef(null);
  const settingsAreDirty = JSON.stringify(annotationSettings) !== appliedSettingsSnapshot;

  const applySettingsNow = React.useCallback(() => {
    if (settingsDebounceRef.current) {
      clearTimeout(settingsDebounceRef.current);
      settingsDebounceRef.current = null;
    }
    setAppliedSettingsSnapshot(JSON.stringify(annotationSettings));
    fetchAnnotations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationSettings, fetchAnnotations]);

  // Effect to fetch annotations when term changes
  useEffect(() => {
    if (step === STEPS.ANNOTATE && terms.length > 0 && currentTermIndex < terms.length) {
      // A term change always fetches fresh with whatever settings are
      // current right now, so any pending auto-apply for the previous term
      // is redundant — drop it rather than letting it fire a moment later.
      if (settingsDebounceRef.current) {
        clearTimeout(settingsDebounceRef.current);
        settingsDebounceRef.current = null;
      }
      setAppliedSettingsSnapshot(JSON.stringify(annotationSettings));
      fetchAnnotations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTermIndex, step]);

  // Auto-apply: once the user pauses on a changed setting for ~1s, refresh
  // automatically. This is the main fix for people not noticing the manual
  // button — it now acts as a fast-forward / reassurance rather than a
  // required step.
  useEffect(() => {
    if (step !== STEPS.ANNOTATE) return;
    if (!settingsAreDirty) return;

    settingsDebounceRef.current = setTimeout(() => {
      setAppliedSettingsSnapshot(JSON.stringify(annotationSettings));
      fetchAnnotations();
    }, 900);

    return () => {
      if (settingsDebounceRef.current) {
        clearTimeout(settingsDebounceRef.current);
        settingsDebounceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationSettings, step, settingsAreDirty]);

  // Modal helpers
  const showConfirmDialog = (title, message, onConfirm, onCancel) => {
    setConfirmModalConfig({
      title,
      message,
      onConfirm: () => { onConfirm(); setShowConfirmModal(false); },
      onCancel: () => { if (onCancel) onCancel(); setShowConfirmModal(false); },
    });
    setShowConfirmModal(true);
  };

  const showInfoDialog = (title, message) => {
    setInfoModalConfig({ title, message });
    setShowInfoModal(true);
  };

  const showSuccessDialog = (message) => showInfoDialog('Success', message);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showSuccessDialog('Copied to clipboard');
  };

  // File upload handler
  const handleFileUpload = async (e, columnMappingFromUpload) => {
    e.preventDefault();

    if (!file) { setError('Please select a file'); return; }

    const { termColumn, contextColumn, parseResult } = columnMappingFromUpload || {};
    if (!termColumn || !parseResult) {
      setError('Please select which column contains the search terms.');
      return;
    }

    setLoadingMessage('Extracting terms…');
    setError(null);

    try {
      const extractedTerms = extractTermsFromColumn(
        parseResult.rows,
        termColumn,
        contextColumn
      );

      if (extractedTerms.length === 0) {
        setError('No terms found in the selected column. Please choose a different column.');
        setLoadingMessage('');
        return;
      }

      // ---------- Idempotent re-import: parse existing annotations ----------
      let existingAnnotations = {};
      let existingCVValues = {};
      const headers = parseResult.headers;

      if (headers.includes('termURI')) {
        const fieldNameToTermId = {};
        extractedTerms.forEach(t => { fieldNameToTermId[t.field_name] = t.id; });

        const fieldAnnotation = {};
        const fieldCVMap = {};

        parseResult.rows.forEach(row => {
          const fieldName = row[termColumn];
          if (!fieldName) return;

          if (!fieldAnnotation[fieldName] && row['termURI']?.trim()) {
            fieldAnnotation[fieldName] = {
              term: fieldName,
              term_id: fieldNameToTermId[fieldName] || `imported_${fieldName}`,
              type: 'datasetField',
              iri: row['termURI'],
              label: row['termLabel'] || '',
              ontology: row['termOntology'] || '',
              definition: '',
              synonyms: [],
              field_name: fieldName,
              short_form: row['termURI'],
              source: 'Re‑imported',
            };
          }

          const cvCol = row['controlledVocabulary'];
          if (cvCol?.trim()) {
            try {
              const cvList = JSON.parse(cvCol);
              if (Array.isArray(cvList)) {
                if (!fieldCVMap[fieldName]) fieldCVMap[fieldName] = [];
                cvList.forEach(cv => {
                  const id = cv.identifier || cv.value;
                  if (!fieldCVMap[fieldName].some(ex => ex.identifier === id)) {
                    fieldCVMap[fieldName].push({
                      id: `reimport_cv_${Date.now()}_${Math.random()}`,
                      term: cv.value,
                      type: 'controlledVocabulary',
                      field_name: fieldName,
                      DatasetField: fieldName,
                      Value: cv.value,
                      identifier: id,
                      displayOrder: 999,
                      iri: cv.iri || '',
                      ontology: cv.ontology || '',
                      definition: '',
                      synonyms: [],
                      isNewlyAdded: false,
                      short_form: cv.identifier || '',
                      cui: [],
                      semantic_type: [],
                    });
                  }
                });
              }
            } catch (e) {
              console.warn('Failed to parse controlledVocabulary column:', e);
            }
          }
        });

        const newSelectedAnnotations = {};
        Object.values(fieldAnnotation).forEach(ann => {
          if (ann.term_id) newSelectedAnnotations[ann.term_id] = ann;
        });
        existingAnnotations = newSelectedAnnotations;
        existingCVValues = fieldCVMap;
      }

      const initialCV = {};
      extractedTerms.forEach(field => {
        initialCV[field.field_name] = existingCVValues[field.field_name] || [];
      });

      setSelectedAnnotations(existingAnnotations);
      setCvValues(initialCV);
      setCurrentTermIndex(0);
      setSearchQuery('');
      setMetadata({
        _raw: {
          headers: parseResult.headers,
          rows: parseResult.rows,
          delimiter: parseResult.delimiter,
          termColumn,
          contextColumn,
        },
      });
      setTerms(extractedTerms);

      setTimeout(() => {
        setStep(STEPS.ANNOTATE);
        setLoadingMessage('');
      }, 100);

    } catch (err) {
      setError('Failed to process file: ' + err.message);
      setLoadingMessage('');
    }
  };

  // Navigation and annotation handlers. Each service's result set resets
  // itself (see fetchAnnotations in useMultiServiceAnnotations), triggered
  // by the currentTermIndex effect above — nothing to reset here directly.
  const navigateToTerm = (index) => {
    setCurrentTermIndex(index);
  };

  const handleSelectAnnotation = (mapping) => {
    const currentTerm = terms[currentTermIndex];
    const newAnnotation = {
      term: currentTerm.term,
      term_id: currentTerm.id,
      type: currentTerm.type,
      iri: mapping['Mapped Term IRI'],
      label: mapping['Class Name'] || mapping['Mapped Term Label'],
      ontology: mapping['Detailed Ontology'] || mapping['Mapped Term Ontology'],
      definition: mapping['Class Definition'] || '',
      synonyms: mapping['Synonyms'] || [],
      field_name: currentTerm.field_name,
      short_form: mapping['Short Form'] || '',
      // Store the exact source string so childrenServiceForAnnotation can
      // resolve the correct backend service key later.
      source: mapping['Source'] || 'Unknown',
      // The complete mapping object as returned/normalized for this
      // annotation, kept verbatim so it can be dumped as its own export
      // column later — nothing summarized or dropped.
      raw_mapping: mapping,
    };

    setSelectedAnnotations({ ...selectedAnnotations, [currentTerm.id]: newAnnotation });
    showSuccessDialog(`Annotation selected: ${newAnnotation.label} (from ${newAnnotation.source})`);
  };

  const handleSkipTerm = () => {
    if (currentTermIndex < terms.length - 1) {
      navigateToTerm(currentTermIndex + 1);
    } else {
      setStep(STEPS.EXPORT);
    }
  };

  const handleNextTerm = () => {
    const currentTerm = terms[currentTermIndex];
    if (!selectedAnnotations[currentTerm.id]) {
      showConfirmDialog(
        'No Annotation Selected',
        `No annotation selected for "${currentTerm.term.substring(0, 50)}${currentTerm.term.length > 50 ? '...' : ''}". Continue anyway?`,
        () => {
          if (currentTermIndex < terms.length - 1) {
            navigateToTerm(currentTermIndex + 1);
          } else {
            setStep(STEPS.EXPORT);
          }
        }
      );
      return;
    }
    if (currentTermIndex < terms.length - 1) {
      navigateToTerm(currentTermIndex + 1);
    } else {
      setStep(STEPS.EXPORT);
    }
  };

  const handlePreviousTerm = () => {
    if (currentTermIndex > 0) navigateToTerm(currentTermIndex - 1);
  };

  const handleFinishAnnotation = () => {
    showConfirmDialog(
      'Finish Annotation',
      `Are you sure you want to finish annotation? You have annotated ${annotationStats.annotated} of ${terms.length} terms.`,
      () => setStep(STEPS.EXPORT)
    );
  };

  const clearAllAnnotations = () => {
    showConfirmDialog(
      'Clear All Annotations',
      'This will clear ALL selected annotations. This action cannot be undone. Continue?',
      () => {
        setSelectedAnnotations({});
        showInfoDialog('Cleared', 'All annotations cleared. You can start over.');
      }
    );
  };

  const handleApplySettingsAndRefresh = () => {
    // No confirmation needed — this doesn't lose any selections, it just
    // re-runs the search for the current term with the latest settings. A
    // confirm dialog here was one more place people could bail out of and
    // end up back in the "did that actually apply?" confusion.
    applySettingsNow();
  };

  // CV Modal handlers
  const handleOpenCVModal = async () => {
    const currentTerm = terms[currentTermIndex];
    const currentAnnotation = selectedAnnotations[currentTerm.id];

    if (!currentAnnotation) {
      showInfoDialog('Select Annotation First', 'Please select an ontology term first');
      return;
    }

    if (currentAnnotation.source === 'Re‑imported' || currentAnnotation.source === 'Unknown') {
      showInfoDialog(
        'Imported Annotation',
        'This annotation was re‑imported from a previous export. Hierarchical children cannot be fetched automatically. You may reselect a term to enable this feature.'
      );
      return;
    }

    // Resolve which backend service to use from the registry — no hardcoded
    // service names here.
    const serviceKey = childrenServiceForAnnotation(currentAnnotation);

    // Guard: if the resolved service has no children support, tell the user.
    if (SERVICE_REGISTRY[serviceKey]?.childrenKey === null) {
      showInfoDialog(
        'Not Supported',
        `The ${SERVICE_REGISTRY[serviceKey]?.label ?? serviceKey} service does not support hierarchical children.`
      );
      return;
    }

    setShowCVModal(true);
    setHierarchicalChildren([]);
    setSelectedCVTerms([]);
    setIsFetchingChildren(true);
    setCvSearchQuery('');
    setCvSearchResults([]);
    setCvSearchError(null);

    try {
      const ontologyPrefix = currentAnnotation.ontology.toLowerCase();
      const children = await fetchHierarchicalChildren(
        ontologyPrefix,
        currentAnnotation.iri,
        currentAnnotation.label,
        serviceKey,
      );
      setHierarchicalChildren(children);
    } catch (err) {
      let errorMessage = err.response?.data?.error || err.message || 'Failed to fetch hierarchical children';

      if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        errorMessage = `The term "${currentAnnotation.label}" was not found in the ${currentAnnotation.ontology} ontology hierarchy.`;
      } else if (errorMessage.includes('double encode')) {
        errorMessage = 'There was an encoding issue with the term IRI. Please try again.';
      } else if (errorMessage.includes('API key')) {
        errorMessage = 'BioPortal API key not configured. Please contact administrator.';
      }

      setError(errorMessage);
      setHierarchicalChildren([]);
    } finally {
      setIsFetchingChildren(false);
    }
  };

  const handleCVSearch = async () => {
    const term = cvSearchQuery.trim();
    if (!term) {
      setCvSearchResults([]);
      setCvSearchError(null);
      return;
    }

    const requestId = Date.now();
    cvSearchRequestIdRef.current = requestId;
    setIsSearchingCV(true);
    setCvSearchError(null);

    try {
      // Reuse the exact same search API (and current annotation settings)
      // that powers the main annotation search, so results are consistent.
      const result = await searchServices(
        term,
        currentTerm?.context || '',
        {
          activeServices: annotationSettings.ontologyService,
          targetOntology: annotationSettings.targetOntology,
          requireExactMatch: annotationSettings.requireExactMatch,
          alsoSearchProperties: annotationSettings.alsoSearchProperties,
          rows: 5,
          start: 0,
        },
        requestId,
        cvSearchRequestIdRef
      );

      if (cvSearchRequestIdRef.current !== requestId) return;
      setCvSearchResults(result.mappings);
    } catch (err) {
      if (cvSearchRequestIdRef.current !== requestId) return;
      setCvSearchError(err.response?.data?.error || err.message || 'Search failed');
      setCvSearchResults([]);
    } finally {
      if (cvSearchRequestIdRef.current === requestId) setIsSearchingCV(false);
    }
  };

  const handleToggleCVTerm = (childTerm) => {
    setSelectedCVTerms(prev => {
      const isSelected = prev.some(t => t.iri === childTerm.iri);
      return isSelected
        ? prev.filter(t => t.iri !== childTerm.iri)
        : [...prev, childTerm];
    });
  };

  const handleAddCVTerms = () => {
    const currentTerm = terms[currentTermIndex];
    const fieldName = currentTerm.field_name;

    if (selectedCVTerms.length === 0) {
      showInfoDialog('Select Terms', 'Please select at least one vocabulary term');
      return;
    }

    const newTerms = selectedCVTerms.map((child, index) => ({
      id: `cv_${Date.now()}_${index}`,
      term: child.label,
      type: 'controlledVocabulary',
      field_name: fieldName,
      DatasetField: fieldName,
      Value: child.label,
      identifier: child.short_form || child.obo_id || child.iri.split('/').pop(),
      displayOrder: 999 + index,
      iri: child.iri,
      ontology: child.ontology_prefix,
      definition: child.description || '',
      synonyms: child.synonyms || [],
      isNewlyAdded: true,
      short_form: child.short_form || '',
      cui: child.cui || [],
      semantic_type: child.semantic_type || [],
    }));

    setCvValues(prev => ({
      ...prev,
      [fieldName]: [...(prev[fieldName] || []), ...newTerms],
    }));

    showSuccessDialog(`Added ${newTerms.length} vocabulary terms to ${fieldName}`);
    setShowCVModal(false);
    setSelectedCVTerms([]);
    setHierarchicalChildren([]);
    setCvSearchQuery('');
    setCvSearchResults([]);
    setCvSearchError(null);
  };

  const handleRemoveCVTerm = (identifier) => {
    const currentTerm = terms[currentTermIndex];
    const fieldName = currentTerm.field_name;
    setCvValues(prev => ({
      ...prev,
      [fieldName]: (prev[fieldName] || []).filter(t => t.identifier !== identifier),
    }));
  };

  // Export handler
  const handleExport = () => {
    setLoadingMessage('Generating annotated file...');
    setError(null);

    try {
      const rawMeta = metadata._raw;
      if (!rawMeta) throw new Error('No file metadata available for export.');

      const fileContent = generateAnnotatedContent(
        rawMeta.rows,
        rawMeta.headers,
        selectedAnnotations,
        rawMeta.termColumn,
        rawMeta.delimiter,
        cvValues
      );

      const ext = rawMeta.delimiter === '\t' ? 'tsv' : 'csv';
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
      const filename = `annotated_${timestamp}.${ext}`;

      const blob = new Blob([fileContent], { type: 'text/tab-separated-values' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();

      showSuccessDialog(
        `File exported successfully!\n\nTotal dataset fields: ${terms.length}\n` +
        `Annotated: ${Object.keys(selectedAnnotations).length}\n` +
        `Skipped: ${terms.length - Object.keys(selectedAnnotations).length}`
      );

      // Reset all state
      setStep(STEPS.UPLOAD);
      setFile(null);
      setTerms([]);
      setCurrentTermIndex(0);
      setSelectedAnnotations({});
      setSearchQuery('');
      setMetadata(DEFAULT_METADATA_STATE);
      setCvValues({});
    } catch (err) {
      setError('Failed to export annotated file: ' + err.message);
    } finally {
      setLoadingMessage('');
    }
  };

  const currentTerm = terms[currentTermIndex];
  const progress = terms.length > 0 ? ((currentTermIndex + 1) / terms.length) * 100 : 0;

  // Build a human-readable label for the active services shown in the footer/subtitle
  const activeServiceLabels = (() => {
    const keys = Array.isArray(annotationSettings.ontologyService)
      ? annotationSettings.ontologyService
      : [annotationSettings.ontologyService];
    return keys
      .map(k => SERVICE_REGISTRY[k]?.shortLabel ?? k)
      .join(', ');
  })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-cobalt-50 to-cobalt-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Ontology Annotator
          </h1>
          <p className="text-gray-600">
            Annotate spreadsheet values with ontology terms
          </p>
          {step === STEPS.ANNOTATE && (
            <p className="text-sm text-gray-500 mt-1">
              Single‑term annotation mode – all unique values from the selected column
              {activeServiceLabels && ` · Services: ${activeServiceLabels}`}
            </p>
          )}
        </div>

        {/* Progress Indicator */}
        {step !== STEPS.UPLOAD && (
          <div className="max-w-6xl mx-auto mb-6">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Step {step === STEPS.ANNOTATE ? '2' : '3'} of 3</span>
              <span>
                {annotationStats.annotated} of {terms.length} values annotated (
                {Math.round((annotationStats.annotated / terms.length) * 100)}%)
              </span>
            </div>
            <div className="relative">
              <div className="w-full bg-gray-200 rounded-full h-3 mb-1">
                <div
                  className="bg-cobalt-600 h-3 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Overall: {Math.round(progress)}%</span>
                <span>Value {currentTermIndex + 1} of {terms.length}</span>
              </div>
            </div>
          </div>
        )}

        <LoadingOverlay
          loading={loading}
          loadingMessage={loadingMessage}
          currentTermIndex={currentTermIndex}
          terms={terms}
          annotationSettings={annotationSettings}
          currentTerm={currentTerm}
        />

        {step === STEPS.UPLOAD && (
          <UploadStep
            file={file}
            setFile={setFile}
            onSubmit={handleFileUpload}
            loading={loading}
          />
        )}

        {step === STEPS.ANNOTATE && currentTerm && (
          <AnnotateStep
            terms={terms}
            currentTermIndex={currentTermIndex}
            currentTerm={currentTerm}
            selectedAnnotations={selectedAnnotations}
            annotationStats={annotationStats}
            cvValues={cvValues}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filteredTerms={filteredTerms}
            annotationSettings={annotationSettings}
            setAnnotationSettings={setAnnotationSettings}
            settingsAreDirty={settingsAreDirty}
            resultsByService={resultsByService}
            activeServiceKeys={activeServiceKeys}
            preferredResults={preferredResults}
            hasPreferredRow={hasPreferredRow}
            usedOntologyCounts={usedOntologyCounts}
            onLoadMoreForService={loadMoreForService}
            onLoadMorePreferredRow={loadMorePreferredRow}
            onNavigateToTerm={navigateToTerm}
            onSelectAnnotation={handleSelectAnnotation}
            onSkipTerm={handleSkipTerm}
            onNextTerm={handleNextTerm}
            onPreviousTerm={handlePreviousTerm}
            onFinishAnnotation={handleFinishAnnotation}
            onClearAllAnnotations={clearAllAnnotations}
            onRefreshAnnotations={fetchAnnotations}
            onApplySettings={handleApplySettingsAndRefresh}
            onOpenCVModal={handleOpenCVModal}
            onRemoveCVTerm={handleRemoveCVTerm}
            onCopyToClipboard={copyToClipboard}
            progress={progress}
          />
        )}

        {step === STEPS.EXPORT && (
          <ExportStep
            annotationStats={annotationStats}
            selectedAnnotations={selectedAnnotations}
            onExport={handleExport}
            onBackToAnnotate={() => setStep(STEPS.ANNOTATE)}
            onStartNew={() => {
              setStep(STEPS.UPLOAD);
              setFile(null);
              setTerms([]);
              setCurrentTermIndex(0);
              setSelectedAnnotations({});
              setSearchQuery('');
              setMetadata(DEFAULT_METADATA_STATE);
              setCvValues({});
            }}
            loading={loading}
          />
        )}

        <ConfirmModal
          show={showConfirmModal}
          title={confirmModalConfig.title}
          message={confirmModalConfig.message}
          onConfirm={confirmModalConfig.onConfirm}
          onCancel={confirmModalConfig.onCancel}
        />

        <InfoModal
          show={showInfoModal}
          title={infoModalConfig.title}
          message={infoModalConfig.message}
          onClose={() => setShowInfoModal(false)}
        />

        <CVModal
          show={showCVModal}
          onClose={() => {
            setShowCVModal(false);
            setCvSearchQuery('');
            setCvSearchResults([]);
            setCvSearchError(null);
          }}
          currentTerm={currentTerm}
          currentAnnotation={currentTerm ? selectedAnnotations[currentTerm.id] : null}
          existingCVValues={currentTerm ? (cvValues[currentTerm.field_name] ?? []) : []}
          hierarchicalChildren={hierarchicalChildren}
          isFetchingChildren={isFetchingChildren}
          selectedCVTerms={selectedCVTerms}
          onToggleCVTerm={handleToggleCVTerm}
          onAddCVTerms={handleAddCVTerms}
          onRemoveCVTerm={handleRemoveCVTerm}
          searchQuery={cvSearchQuery}
          onSearchQueryChange={setCvSearchQuery}
          onSearch={handleCVSearch}
          searchResults={cvSearchResults}
          isSearching={isSearchingCV}
          searchError={cvSearchError}
        />

        <ErrorDisplay error={error} onDismiss={() => setError(null)} />
      </div>

      {/* Footer — service list is derived from the registry, not hardcoded */}
      <div className="mt-12 pt-8 border-t border-gray-200 text-center text-sm text-gray-500">
        <p>
          Ontology Annotator &bull; Powered by{' '}
          {ALL_SERVICE_KEYS.map((key, i) => (
            <span key={key}>
              {i > 0 && (i === ALL_SERVICE_KEYS.length - 1 ? ' and ' : ', ')}
              {SERVICE_REGISTRY[key].label}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

export default App;