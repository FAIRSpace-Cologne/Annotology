import React from 'react';

const ExportStep = ({
  annotationStats,
  selectedAnnotations,
  onExport,
  onBackToAnnotate,
  onStartNew,
  loading
}) => {
  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-xl p-8">
      <div className="text-center mb-2">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
          ✓
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Annotation Complete!</h2>
        <p className="text-gray-600 mb-8">Your data has been annotated with ontology terms</p>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-green-700">{annotationStats.total}</div>
            <div className="text-sm text-green-600">Unique Values</div>
          </div>
          <div className="bg-cobalt-50 border border-cobalt-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-cobalt-700">{annotationStats.annotated}</div>
            <div className="text-sm text-cobalt-600">Annotated</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-yellow-700">{annotationStats.skipped}</div>
            <div className="text-sm text-yellow-600">Skipped</div>
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <h4 className="font-medium text-gray-700 mb-3">Annotations Preview</h4>
          <div className="max-h-48 overflow-y-auto space-y-2">
            {Object.entries(selectedAnnotations).slice(0, 5).map(([id, annotation]) => (
              <div key={id} className="bg-white p-3 rounded border border-gray-100">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium text-gray-800 truncate">{annotation.term}</div>
                    <div className="text-sm text-gray-600">{annotation.label}</div>
                    <div className="text-xs text-gray-500">
                      Source: <span className={`${annotation.source === 'BioPortal' ? 'text-blossom-600' : 'text-cobalt-600'}`}>
                        {annotation.source}
                      </span>
                    </div>
                    {annotation.short_form && (
                      <div className="text-xs text-green-600 mt-1">
                        Short Form: {annotation.short_form}
                      </div>
                    )}
                    {annotation.definition && (
                      <div className="text-xs text-gray-500 mt-1 truncate">{annotation.definition.substring(0, 80)}...</div>
                    )}
                  </div>
                  <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded ml-2">
                    {annotation.ontology}
                  </span>
                </div>
              </div>
            ))}
            {Object.keys(selectedAnnotations).length > 5 && (
              <div className="text-center text-sm text-gray-500">
                ...and {Object.keys(selectedAnnotations).length - 5} more annotations
              </div>
            )}
          </div>
        </div>

        <div className="bg-cobalt-50 border border-cobalt-200 rounded-xl p-4">
          <h4 className="font-medium text-cobalt-800 mb-2">Export Details</h4>
          <p className="text-sm text-cobalt-700 mb-3">
            The exported file will contain the original columns plus the following new annotation columns:
          </p>
          <div className="space-y-2">
            <div className="flex items-start">
              <span className="text-green-600 mr-2">✓</span>
              <span className="text-sm">
                <strong>termURI</strong> – the ontology term identifier (short form or IRI)
              </span>
            </div>
            <div className="flex items-start">
              <span className="text-green-600 mr-2">✓</span>
              <span className="text-sm">
                <strong>termLabel</strong> – the human‑readable label of the selected term
              </span>
            </div>
            <div className="flex items-start">
              <span className="text-green-600 mr-2">✓</span>
              <span className="text-sm">
                <strong>termOntology</strong> – the ontology prefix (e.g. EFO, MONDO)
              </span>
            </div>
            <div className="flex items-start">
              <span className="text-green-600 mr-2">✓</span>
              <span className="text-sm">
                <strong>controlledVocabulary</strong> – any child terms you selected, stored as a JSON list
              </span>
            </div>
            <div className="flex items-start">
              <span className="text-green-600 mr-2">✓</span>
              <span className="text-sm">
                <strong>annotationRawJSON</strong> – the complete ontology record behind your selected
                annotation, kept in full so nothing is lost
              </span>
            </div>
          </div>
          <p className="text-xs text-cobalt-600 mt-3">
            The exported file is <strong>idempotent</strong> – you can re‑import it later to resume exactly where you left off.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={onExport}
            disabled={loading}
            className="w-full bg-gradient-to-r from-green-600 to-citrus-600 text-white py-3 px-4 rounded-xl hover:from-green-700 hover:to-citrus-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-300 font-medium flex items-center justify-center"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating File...
              </>
            ) : (
              'Download Annotated File'
            )}
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onBackToAnnotate}
              className="py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              ← Back to Annotation
            </button>
            <button
              onClick={onStartNew}
              className="py-2 bg-cobalt-100 text-cobalt-700 rounded-lg hover:bg-cobalt-200 transition-colors"
            >
              Start New Annotation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportStep;