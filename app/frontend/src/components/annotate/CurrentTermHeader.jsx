import React from 'react';

const CurrentTermHeader = ({
  currentTerm,
  currentTermIndex,
  terms,
  selectedAnnotations,
  onCopyToClipboard
}) => {
  return (
    <div className="p-6 border-b bg-gradient-to-r from-sky-500 to-cobalt-50">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="px-3 py-1 text-xs font-medium bg-white text-gray-700 rounded-full border border-gray-200">
              Value {currentTermIndex + 1} of {terms.length}
            </span>
            {/* Removed the hardcoded "Allows Controlled Vocabulary" badge – all terms can have CV if annotated */}
            {selectedAnnotations[currentTerm.id] && (
              <span className="px-3 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full border border-green-200 animate-pulse">
                ✓ Annotated
              </span>
            )}
          </div>

          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-2xl font-bold text-gray-800 mb-2">{currentTerm.term}</h3>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-gray-700">Type:</span>
                <span className="px-2 py-1 bg-gray-100 text-gray-800 text-sm rounded">
                  {currentTerm.field_type || 'text'}
                </span>
              </div>
              {currentTerm.context && (
                <p className="text-sm text-gray-600 bg-white/50 rounded p-2">
                  {currentTerm.context}
                </p>
              )}
            </div>
            <div className="ml-4 flex space-x-2">
              <button
                onClick={() => onCopyToClipboard(`${currentTerm.term} - ${currentTerm.context || ''}`)}
                className="p-2 text-gray-500 hover:text-gray-700"
                title="Copy term"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CurrentTermHeader;