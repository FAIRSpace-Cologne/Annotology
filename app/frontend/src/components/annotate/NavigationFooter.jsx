import React from 'react';

const NavigationFooter = ({
  currentTermIndex,
  terms,
  selectedAnnotations,
  progress,
  onPreviousTerm,
  onRefreshAnnotations,
  onSkipTerm,
  onFinishAnnotation,
  onNextTerm
}) => {
  const annotatedCount = Object.keys(selectedAnnotations).length;

  return (
    <div className="p-6 bg-gray-50 border-t">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div className="flex space-x-3">
          <button
            onClick={onPreviousTerm}
            disabled={currentTermIndex === 0}
            className={`px-5 py-2 rounded-lg font-medium transition-all ${
              currentTermIndex === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:shadow'
            }`}
          >
            ← Previous
          </button>
          <button
            onClick={onRefreshAnnotations}
            className="px-5 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow font-medium"
          >
            Refresh Search
          </button>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onSkipTerm}
            className="px-5 py-2 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg hover:bg-yellow-100 hover:shadow font-medium"
          >
            Skip
          </button>
          <button
            onClick={onFinishAnnotation}
            className="px-5 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 hover:shadow font-medium"
          >
            Finish
          </button>
          <button
            onClick={onNextTerm}
            className="px-8 py-2 bg-gradient-to-r from-cobalt-600 to-cobalt-800 text-white rounded-lg hover:from-cobalt-700 hover:to-cobalt-900 font-medium shadow hover:shadow-lg transition-all"
          >
            {currentTermIndex === terms.length - 1 ? 'Finalize →' : 'Next →'}
          </button>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Progress: {currentTermIndex + 1} of {terms.length} terms</span>
          <span>{Math.round((currentTermIndex / terms.length) * 100)}% complete</span>
        </div>
        <div className="mt-2 flex space-x-2">
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${(annotatedCount / terms.length) * 100}%` }}
            />
          </div>
          <div className="text-xs text-gray-500">
            {annotatedCount}/{terms.length}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NavigationFooter;
