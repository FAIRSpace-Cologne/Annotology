import React from 'react';
import AnnotationSettings from './AnnotationSettings';
import { TermList, QuickSearch, SessionControl, QuickStatsBar, OntologyUsagePanel } from './annotate/Sidebar';
import MappingsList from './annotate/MappingsList';
import CurrentTermHeader from './annotate/CurrentTermHeader';
import AddChildrenTermsPrompt from './annotate/AddChildrenTermsPrompt';
import NavigationFooter from './annotate/NavigationFooter';

const AnnotateStep = ({
  terms,
  currentTermIndex,
  currentTerm,
  selectedAnnotations,
  annotationStats,
  cvValues,
  searchQuery,
  setSearchQuery,
  filteredTerms,
  annotationSettings,
  setAnnotationSettings,
  settingsAreDirty,
  resultsByService,
  activeServiceKeys,
  preferredResults,
  hasPreferredRow,
  usedOntologyCounts,
  onLoadMoreForService,
  onLoadMorePreferredRow,
  onNavigateToTerm,
  onSelectAnnotation,
  onSkipTerm,
  onNextTerm,
  onPreviousTerm,
  onFinishAnnotation,
  onClearAllAnnotations,
  onRefreshAnnotations,
  onApplySettings,
  onOpenCVModal,
  onRemoveCVTerm,
  onCopyToClipboard,
  progress
}) => {
  const anyLoading = activeServiceKeys.some(k => resultsByService[k]?.loading);

  return (
    <div className="max-w-7xl mx-auto">
      <QuickStatsBar
        annotationStats={annotationStats}
        onClearAll={onClearAllAnnotations}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <TermList
            terms={terms}
            currentTermIndex={currentTermIndex}
            selectedAnnotations={selectedAnnotations}
            onNavigate={onNavigateToTerm}
          />

          <QuickSearch
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filteredTerms={filteredTerms}
            onSelectTerm={(termId) => {
              const termIndex = terms.findIndex(t => t.id === termId);
              if (termIndex !== -1) {
                onNavigateToTerm(termIndex);
                setSearchQuery('');
              }
            }}
            selectedAnnotations={selectedAnnotations}
          />

          <SessionControl onFinish={onFinishAnnotation} />

          <OntologyUsagePanel usedOntologyCounts={usedOntologyCounts} />
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <AnnotationSettings
              annotationSettings={annotationSettings}
              setAnnotationSettings={setAnnotationSettings}
              loading={anyLoading}
              settingsAreDirty={settingsAreDirty}
              onApplySettings={onApplySettings}
            />

            <CurrentTermHeader
              currentTerm={currentTerm}
              currentTermIndex={currentTermIndex}
              terms={terms}
              selectedAnnotations={selectedAnnotations}
              onCopyToClipboard={onCopyToClipboard}
            />

            <MappingsList
              resultsByService={resultsByService}
              activeServiceKeys={activeServiceKeys}
              preferredResults={preferredResults}
              hasPreferredRow={hasPreferredRow}
              usedOntologyCounts={usedOntologyCounts}
              currentTerm={currentTerm}
              selectedAnnotations={selectedAnnotations}
              onSelectAnnotation={onSelectAnnotation}
              onSkipTerm={onSkipTerm}
              onRefreshAnnotations={onRefreshAnnotations}
              onLoadMoreForService={onLoadMoreForService}
              onLoadMorePreferredRow={onLoadMorePreferredRow}
              onCopyToClipboard={onCopyToClipboard}
            />

            {/* Moved below the results list (was above) so it's noticed
                after a result has been picked, not before. */}
            {currentTerm && selectedAnnotations[currentTerm.id] && (
              <AddChildrenTermsPrompt
                cvTerms={cvValues[currentTerm.field_name] ?? []}
                onOpenCVModal={onOpenCVModal}
                onRemoveCVTerm={onRemoveCVTerm}
              />
            )}

            <NavigationFooter
              currentTermIndex={currentTermIndex}
              terms={terms}
              selectedAnnotations={selectedAnnotations}
              progress={progress}
              onPreviousTerm={onPreviousTerm}
              onRefreshAnnotations={onRefreshAnnotations}
              onSkipTerm={onSkipTerm}
              onFinishAnnotation={onFinishAnnotation}
              onNextTerm={onNextTerm}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnotateStep;