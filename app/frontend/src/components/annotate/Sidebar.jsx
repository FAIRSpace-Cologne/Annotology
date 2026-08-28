import React from 'react';

export const TermList = ({ terms, currentTermIndex, selectedAnnotations, onNavigate }) => (
  <div className="bg-white rounded-lg shadow p-4">
    <h3 className="font-medium text-gray-700 mb-3">Dataset Fields</h3>
    <div className="space-y-1 max-h-96 overflow-y-auto">
      {terms.map((term, index) => {
        const isAnnotated = selectedAnnotations[term.id];
        const isCurrent = index === currentTermIndex;
        return (
          <button
            key={term.id}
            onClick={() => onNavigate(index)}
            className={`w-full text-left px-3 py-2 rounded text-sm truncate transition-all ${
              isCurrent
                ? 'bg-cobalt-50 text-cobalt-700 border-l-4 border-cobalt-500'
                : 'hover:bg-gray-50'
            }`}
            title={term.term}
          >
            <div className="flex items-center justify-between">
              <span className="truncate">{index + 1}. {term.term.substring(0, 25)}{term.term.length > 25 ? '...' : ''}</span>
              {isAnnotated ? (
                <span className="text-green-600 text-xs">✓</span>
              ) : (
                <span className="text-gray-400 text-xs">○</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  </div>
);

export const QuickSearch = ({ searchQuery, setSearchQuery, filteredTerms, onSelectTerm, selectedAnnotations }) => (
  <div className="bg-white rounded-lg shadow p-4">
    <h3 className="font-medium text-gray-700 mb-3">Quick Search</h3>
    <input
      type="text"
      placeholder="Search terms..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-cobalt-500 focus:border-transparent"
    />
    {searchQuery && filteredTerms.length > 0 && (
      <div className="mt-2 max-h-48 overflow-y-auto border rounded">
        {filteredTerms.slice(0, 10).map(term => (
          <button
            key={term.id}
            onClick={() => onSelectTerm(term.id)}
            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-b-0"
          >
            <div className="flex justify-between">
              <span className="truncate">{term.term.substring(0, 40)}{term.term.length > 40 ? '...' : ''}</span>
              <span className={`text-xs px-2 py-1 rounded ${
                selectedAnnotations[term.id] ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
              }`}>
                {selectedAnnotations[term.id] ? 'Annotated' : 'Pending'}
              </span>
            </div>
          </button>
        ))}
      </div>
    )}
  </div>
);

export const SessionControl = ({ onFinish }) => (
  <div className="bg-white rounded-lg shadow p-4">
    <h3 className="font-medium text-gray-700 mb-3">Session Control</h3>
    <button
      onClick={onFinish}
      className="w-full px-4 py-2 bg-gradient-to-r from-green-600 to-citrus-600 text-white rounded-lg hover:from-green-700 hover:to-citrus-700 font-medium flex items-center justify-center"
    >
      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      Finish & Export
    </button>
    <p className="text-xs text-gray-500 mt-2 text-center">
      Complete annotation early with current selections
    </p>
  </div>
);

export const OntologyUsagePanel = ({ usedOntologyCounts }) => (
  <div className="bg-white rounded-lg shadow p-4">
    <h3 className="font-medium text-gray-700 mb-1">Ontologies You've Used</h3>
    <p className="text-xs text-gray-500 mb-3">
      Tracks which ontologies your picks have come from, to help you stay consistent.
    </p>
    {usedOntologyCounts.length === 0 ? (
      <p className="text-xs text-gray-400 italic">
        None yet — your first pick will show up here.
      </p>
    ) : (
      <div className="space-y-1.5">
        {usedOntologyCounts.map(({ ontology, count }, idx) => (
          <div
            key={ontology}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded text-sm ${
              idx === 0 ? 'bg-olive-50 border border-olive-200' : 'bg-gray-50'
            }`}
          >
            <span className={`font-medium truncate ${idx === 0 ? 'text-olive-800' : 'text-gray-700'}`}>
              {idx === 0 && <span className="mr-1" title="Most-used ontology so far">⭐</span>}
              {ontology}
            </span>
            <span className={`shrink-0 ml-2 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
              idx === 0 ? 'bg-olive-500 text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              {count}
            </span>
          </div>
        ))}
      </div>
    )}
  </div>
);

export const QuickStatsBar = ({ annotationStats, onClearAll }) => (
  <div className="max-w-6xl mx-auto mb-4 bg-white rounded-lg shadow-sm p-3">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-6">
        <div className="text-center">
          <div className="text-lg font-bold text-cobalt-600">{annotationStats.annotated}</div>
          <div className="text-xs text-gray-500">Annotated</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-yellow-600">{annotationStats.skipped}</div>
          <div className="text-xs text-gray-500">Skipped</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-green-600">{annotationStats.remaining}</div>
          <div className="text-xs text-gray-500">Remaining</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-gray-700">{annotationStats.total}</div>
          <div className="text-xs text-gray-500">Total</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onClearAll}
          className="px-3 py-1 text-sm bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100"
        >
          Clear All
        </button>
      </div>
    </div>
  </div>
);
