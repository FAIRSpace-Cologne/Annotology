import React from 'react';

// Controlled-vocabulary entry point. Feedback showed people didn't
// understand what this was for, so it's paired with a one-line explanation
// of the purpose, and shows a count once terms have been added so it's
// obvious this is optional, additive, and already has content. It now sits
// below the results list (rather than above it) so people notice it only
// after they've already picked an annotation and are looking at what to do
// next, instead of before they've seen any results at all.
//
// The selected terms themselves are now listed right here too, so the user
// can see what's already been attached to this term without reopening the
// picker — previously the only way to check was to open the modal again.
const AddChildrenTermsPrompt = ({ cvTerms = [], onOpenCVModal, onRemoveCVTerm }) => {
  const cvCount = cvTerms.length;

  return (
    <div className="px-6 pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-blossom-50 border border-blossom-200 rounded-lg px-4 py-3">
        <p className="text-sm text-gray-700">
          <span className="font-medium text-blossom-800">Optional:</span> attach more specific child
          terms (e.g. subtypes) to this annotation for extra detail.
          {cvCount > 0 && (
            <span className="ml-1 text-blossom-700 font-medium">
              {cvCount} term{cvCount === 1 ? '' : 's'} added so far.
            </span>
          )}
        </p>
        <button
          onClick={onOpenCVModal}
          className="shrink-0 px-4 py-2 bg-gradient-to-r from-blossom-500 to-blossom-700 text-white rounded-lg hover:from-blossom-600 hover:to-blossom-800 font-medium flex items-center justify-center shadow-sm"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          {cvCount > 0 ? `Edit Children Terms (${cvCount})` : 'Add Children Terms'}
        </button>
      </div>

      {cvCount > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {cvTerms.map((cv, idx) => (
            <span
              key={cv.id || cv.identifier || idx}
              className="group inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 bg-white border border-blossom-300 rounded-full text-sm text-blossom-900"
              title={cv.definition || undefined}
            >
              {cv.Value || cv.term}
              {cv.ontology && (
                <span className="text-xs text-blossom-600">({cv.ontology})</span>
              )}
              {onRemoveCVTerm && (
                <button
                  type="button"
                  onClick={() => onRemoveCVTerm(cv.identifier)}
                  title="Remove this term"
                  className="ml-0.5 text-blossom-400 group-hover:text-red-500 font-bold leading-none"
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default AddChildrenTermsPrompt;
