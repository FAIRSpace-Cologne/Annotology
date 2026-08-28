import React from 'react';

const LoadingOverlay = ({ loading, loadingMessage, currentTermIndex, terms, annotationSettings, currentTerm }) => {
  if (!loading) return null;

  const activeServices = Array.isArray(annotationSettings.ontologyService)
    ? annotationSettings.ontologyService
    : [annotationSettings.ontologyService];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-8 max-w-md text-center shadow-2xl">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cobalt-600 mx-auto"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-cobalt-600">
              {Math.round((currentTermIndex / terms.length) * 100)}%
            </span>
          </div>
        </div>
        <p className="mt-6 text-gray-700 font-medium text-lg">{loadingMessage || 'Processing...'}</p>
        {loadingMessage && loadingMessage.includes('Searching') && (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-gray-500">
              Searching {activeServices.join(' + ')} for "{currentTerm?.term?.substring(0, 30)}..."
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadingOverlay;