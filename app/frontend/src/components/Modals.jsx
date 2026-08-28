import React, { useState } from 'react';

export const ConfirmModal = ({ show, title, message, onConfirm, onCancel }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b">
          <h3 className="text-xl font-bold text-gray-800">{title}</h3>
        </div>
        <div className="p-6">
          <p className="text-gray-600 whitespace-pre-line">{message}</p>
        </div>
        <div className="p-6 border-t bg-gray-50 flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-cobalt-600 text-white rounded-lg hover:bg-cobalt-700"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export const InfoModal = ({ show, title, message, onClose }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b">
          <h3 className="text-xl font-bold text-gray-800">{title}</h3>
        </div>
        <div className="p-6">
          <p className="text-gray-600 whitespace-pre-line">{message}</p>
        </div>
        <div className="p-6 border-t bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-cobalt-600 text-white rounded-lg hover:bg-cobalt-700"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Convert a raw search mapping (as returned by searchServices / the
 * annotate-term API) into the same shape used by hierarchical children,
 * so it can flow through the exact same select/add pipeline.
 */
function mappingToCVTerm(mapping) {
  return {
    iri: mapping['Mapped Term IRI'],
    label: mapping['Class Name'] || mapping['Mapped Term Label'],
    ontology_prefix: mapping['Detailed Ontology'] || mapping['Mapped Term Ontology'],
    description: mapping['Class Definition'] || '',
    synonyms: mapping['Synonyms'] || [],
    short_form: mapping['Short Form'] || '',
    cui: mapping['CUI'] || [],
    semantic_type: mapping['Semantic Type'] || [],
    source: mapping['Source'] || '',
  };
}

/**
 * Shared card renderer for a selectable term — used for both hierarchical
 * children and ontology search results, since both are normalized to the
 * same shape (iri, label, ontology_prefix, description, synonyms, cui).
 */
function TermCard({ term, isSelected, onToggle }) {
  return (
    <div
      className={`border rounded-lg p-4 cursor-pointer transition-all ${isSelected
        ? 'border-blossom-500 bg-blossom-50'
        : 'border-gray-200 hover:border-blossom-300'
        }`}
      onClick={onToggle}
    >
      <div className="flex items-start">
        <div className="flex-shrink-0 mt-1 mr-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggle}
            // The card itself is also clickable (onClick below) so people can
            // click anywhere in it to select a term. Without this, clicking
            // directly on the checkbox fired both this onChange AND the
            // card's onClick (the click event bubbles up from the input),
            // toggling it twice and silently cancelling the click out —
            // which is exactly the bug being fixed here.
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 text-blossom-600 rounded"
          />
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-start">
            <h4 className="font-medium text-gray-900">{term.label}</h4>
            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-800 rounded">
              {term.ontology_prefix}
            </span>
            {term.cui && term.cui.length > 0 && (
              <span className="text-xs px-2 py-1 bg-cobalt-100 text-cobalt-800 rounded ml-2">
                CUI: {term.cui[0]}
              </span>
            )}
          </div>
          {term.description && (
            <p className="text-sm text-gray-600 mt-2">
              {term.description}
            </p>
          )}
          {term.synonyms && term.synonyms.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-medium text-gray-500 mb-1">Synonyms:</div>
              <div className="flex flex-wrap gap-1">
                {term.synonyms.slice(0, 3).map((syn, idx) => (
                  <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                    {syn}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center text-xs text-gray-500">
            <span className="truncate">{term.iri}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export const CVModal = ({
  show,
  onClose,
  currentTerm,
  currentAnnotation,
  existingCVValues,
  hierarchicalChildren,
  isFetchingChildren,
  selectedCVTerms,
  onToggleCVTerm,
  onAddCVTerms,
  onRemoveCVTerm,
  searchQuery,
  onSearchQueryChange,
  onSearch,
  searchResults,
  isSearching,
  searchError,
}) => {
  const [activeTab, setActiveTab] = useState('browse'); // 'browse' | 'search'

  if (!show) return null;

  const isTermSelected = (term) => selectedCVTerms.some(t => t.iri === term.iri);
  const isAlreadyAdded = (term) => existingCVValues.some(t => t.iri === term.iri);

  const selectableTerms = hierarchicalChildren
    .filter((child) => !isAlreadyAdded(child))
    .map((child, index) => (
      <TermCard
        key={child.iri || index}
        term={child}
        isSelected={isTermSelected(child)}
        onToggle={() => onToggleCVTerm(child)}
      />
    ));

  const searchResultCards = (searchResults || [])
    .map(mappingToCVTerm)
    .filter((term) => term.iri && !isAlreadyAdded(term))
    .map((term, index) => (
      <TermCard
        key={`search-${term.iri}-${index}`}
        term={term}
        isSelected={isTermSelected(term)}
        onToggle={() => onToggleCVTerm(term)}
      />
    ));

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSearch();
    }
  };
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b bg-blossom-50">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-800">
              Add Controlled Vocabulary Terms
            </h3>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          {/* Plain-language explanation of what this is and why someone
              would use it — feedback showed people didn't understand this
              feature at all. */}
          <p className="text-sm text-gray-700 mt-2">
            This is <strong>optional</strong>. You already annotated <strong>{currentTerm?.field_name}</strong> with{' '}
            <strong>{currentAnnotation?.label}</strong>. If your data actually uses more specific values
            underneath that term (e.g. named subtypes), you can attach those narrower terms here too —
            they'll be recorded alongside the main annotation and included in your export.
          </p>
        </div>

        {existingCVValues.length > 0 && (
          <div className="px-6 pt-4">
            <div className="bg-cobalt-50 border border-cobalt-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-cobalt-800 mb-1">
                Already added ({existingCVValues.length})
              </h4>
              <p className="text-xs text-cobalt-700 mb-3">
                Click a term to remove it.
              </p>
              <div className="flex flex-wrap gap-2">
                {existingCVValues.map((cv, index) => (
                  <button
                    type="button"
                    key={index}
                    onClick={() => onRemoveCVTerm(cv.identifier)}
                    title="Click to remove"
                    className="group px-3 py-1 bg-white text-cobalt-800 border border-cobalt-300 rounded-full text-sm hover:bg-red-50 hover:border-red-300 hover:text-red-700 flex items-center gap-1.5"
                  >
                    {cv.Value}
                    {cv.identifier && (
                      <span className="text-xs text-cobalt-600 group-hover:text-red-500">({cv.identifier})</span>
                    )}
                    <span className="text-gray-400 group-hover:text-red-500 font-bold">✕</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tabs: hierarchy browsing is pre-loaded on open, so it's the
            default; search is there for when the hierarchy doesn't have
            what the user needs. */}
        <div className="px-6 pt-4">
          <div className="flex gap-1 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setActiveTab('browse')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'browse'
                  ? 'border-blossom-600 text-blossom-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Browse related terms
              {hierarchicalChildren.length > 0 && (
                <span className="ml-1.5 text-xs text-gray-400">({selectableTerms.length})</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('search')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'search'
                  ? 'border-blossom-600 text-blossom-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Search for a specific term
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'search' && (
          <div>
            <p className="text-sm text-gray-500 mb-3">
              Can't find the right term by browsing? Search the same ontology services used for your main
              annotation search, and add any result directly.
            </p>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search for a term to add…"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-cobalt-500 focus:border-transparent"
              />
              <button
                onClick={onSearch}
                disabled={isSearching || !searchQuery?.trim()}
                className="px-4 py-2 bg-cobalt-600 text-white text-sm rounded-lg hover:bg-cobalt-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isSearching ? 'Searching…' : 'Search'}
              </button>
            </div>

            {searchError && (
              <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                {searchError}
              </div>
            )}

            {isSearching ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-cobalt-600"></div>
                <p className="mt-3 text-sm text-gray-600">Searching ontologies…</p>
              </div>
            ) : searchResultCards.length > 0 ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">
                    Found {searchResultCards.length} matching term{searchResultCards.length === 1 ? '' : 's'}
                  </span>
                </div>
                {searchResultCards}
              </div>
            ) : searchQuery?.trim() && !isSearching ? (
              <p className="text-sm text-gray-400 italic">No results yet — try searching for a term above.</p>
            ) : (
              <p className="text-sm text-gray-400 italic">Type a term above and press Search or Enter.</p>
            )}
          </div>
          )}

          {activeTab === 'browse' && (
          <div>
            <p className="text-sm text-gray-500 mb-3">
              These are the narrower (child) terms directly beneath <strong>{currentAnnotation?.label}</strong>{' '}
              in its ontology — pick any that apply to your data.
            </p>

            {isFetchingChildren ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cobalt-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Fetching related terms...</p>
              </div>
            ) : hierarchicalChildren.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-gray-500 text-lg">No related terms found for this annotation</p>
                <p className="text-gray-400 text-sm mt-2">
                  This ontology term doesn't have any child terms in its hierarchy — try the Search tab instead.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('search')}
                  className="mt-4 px-4 py-2 bg-cobalt-50 text-cobalt-700 border border-cobalt-200 rounded-lg hover:bg-cobalt-100 text-sm font-medium"
                >
                  Switch to Search
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm text-gray-600">
                    Found {selectableTerms.length} related term{selectableTerms.length === 1 ? '' : 's'}
                  </span>
                  <span className="text-sm text-gray-600">
                    Selected: {selectedCVTerms.length}
                  </span>
                </div>
                {selectableTerms}
              </div>
            )}
          </div>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-sm text-gray-600">
                {selectedCVTerms.length} new terms selected
              </span>
              {existingCVValues.length > 0 && (
                <span className="text-sm text-cobalt-600 ml-4">
                  {existingCVValues.length} existing terms
                </span>
              )}
            </div>
            <div className="space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={onAddCVTerms}
                disabled={selectedCVTerms.length === 0}
                className="px-4 py-2 bg-gradient-to-r from-blossom-500 to-blossom-700 text-white rounded-lg hover:from-blossom-600 hover:to-blossom-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Selected Terms
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};