import React, { useState, useCallback } from 'react';
import { parseDelimitedFile } from '../utils/tsvParser';

// ── Drag-and-drop file zone ────────────────────────────────────────────────
function FileZone({ file, onFileChange }) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) onFileChange(dropped);
  }, [onFileChange]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors duration-200 cursor-pointer
        ${dragging ? 'border-cobalt-500 bg-cobalt-50' : 'border-gray-300 hover:border-cobalt-400 hover:bg-gray-50'}`}
      onClick={() => document.getElementById('file-input').click()}
    >
      <input
        id="file-input"
        type="file"
        accept=".tsv,.csv,.txt"
        className="hidden"
        onChange={(e) => e.target.files[0] && onFileChange(e.target.files[0])}
      />
      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-cobalt-100 flex items-center justify-center text-2xl">
          📄
        </div>
        {file ? (
          <>
            <p className="font-semibold text-gray-800">{file.name}</p>
            <p className="text-sm text-gray-500">Click or drop to change file</p>
          </>
        ) : (
          <>
            <p className="font-semibold text-gray-700">Drop your file here, or click to browse</p>
            <p className="text-sm text-gray-400">TSV, CSV, or plain-text files supported</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Small numbered step badge used in section headers ─────────────────────
function StepBadge({ number, done }) {
  return (
    <span
      className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0
        ${done ? 'bg-emerald-500 text-white' : 'bg-cobalt-600 text-white'}`}
    >
      {done ? '✓' : number}
    </span>
  );
}

// ── Column preview card ────────────────────────────────────────────────────
function ColumnCard({ header, sampleValues, isSelected, role, onClick }) {
  const roleColors = {
    term: 'ring-2 ring-cobalt-500 bg-cobalt-50',
    context: 'ring-2 ring-emerald-400 bg-emerald-50',
    none: '',
  };
  const roleBadge = {
    term: { label: 'Search terms', color: 'bg-cobalt-600 text-white' },
    context: { label: 'Context', color: 'bg-emerald-600 text-white' },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border border-gray-200 p-4 transition-all duration-150 hover:border-cobalt-300 hover:shadow-sm focus:outline-none
        ${roleColors[role] || ''}`}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="font-semibold text-gray-800 truncate">{header}</span>
        {roleBadge[role] && (
          <span className={`ml-2 shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${roleBadge[role].color}`}>
            {roleBadge[role].label}
          </span>
        )}
      </div>
      <div className="space-y-0.5">
        {sampleValues.slice(0, 3).map((v, i) => (
          <p key={i} className="text-xs text-gray-400 truncate">
            {v || <span className="italic">—empty—</span>}
          </p>
        ))}
      </div>
    </button>
  );
}

// ── Main UploadStep ────────────────────────────────────────────────────────
export default function UploadStep({ file, setFile, onSubmit, loading }) {
  const [parseResult, setParseResult] = useState(null); // { headers, rows, delimiter }
  const [parseError, setParseError] = useState(null);
  const [termColumn, setTermColumn] = useState(null);
  const [contextColumn, setContextColumn] = useState(null);
  const [clickIntent, setClickIntent] = useState('term'); // 'term' | 'context'

  const handleFileChange = (selected) => {
    setFile(selected);
    setParseResult(null);
    setParseError(null);
    setTermColumn(null);
    setContextColumn(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = parseDelimitedFile(e.target.result);
        setParseResult(result);
      } catch (err) {
        setParseError(err.message);
      }
    };
    reader.readAsText(selected);
  };

  const handleColumnClick = (header) => {
    if (clickIntent === 'term') {
      setTermColumn(header);
      if (contextColumn === header) setContextColumn(null);
      // Guide the user straight into picking a context column next, since
      // both are required before annotating can start.
      setClickIntent('context');
    } else {
      setContextColumn(prev => prev === header ? null : header);
      if (termColumn === header) setTermColumn(null);
    }
  };

  const getRole = (header) => {
    if (header === termColumn) return 'term';
    if (header === contextColumn) return 'context';
    return 'none';
  };

  const getSampleValues = (header) =>
    (parseResult?.rows || []).slice(0, 5).map(r => r[header]);

  const canProceed = termColumn !== null && contextColumn !== null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canProceed) return;
    onSubmit(e, { termColumn, contextColumn, parseResult });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 bg-gradient-to-r from-sky-500 to-cobalt-50">
          <h2 className="text-xl font-bold text-gray-800">Upload your file</h2>
          <p className="text-sm text-gray-500 mt-1">
            Three quick steps: upload a file, choose your term and context columns, then start annotating.
          </p>
          {/* Step tracker */}
          <div className="flex items-center gap-2 mt-4 text-xs font-medium text-gray-500">
            <StepBadge number={1} done={!!parseResult} />
            <span className={parseResult ? 'text-emerald-600' : 'text-gray-600'}>Upload file</span>
            <span className="w-6 h-px bg-gray-300" />
            <StepBadge number={2} done={canProceed} />
            <span className={canProceed ? 'text-emerald-600' : parseResult ? 'text-gray-700' : 'text-gray-400'}>
              Select term &amp; context columns
            </span>
            <span className="w-6 h-px bg-gray-300" />
            <StepBadge number={3} done={false} />
            <span className={canProceed ? 'text-gray-700' : 'text-gray-400'}>Start annotating</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-6">
          {/* File drop zone */}
          <FileZone file={file} onFileChange={handleFileChange} />

          {parseError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {parseError}
            </div>
          )}

          {/* Column selection */}
          {parseResult && (
            <div className="space-y-4">
              {/* Prominent call-to-action until both columns are chosen */}
              {!canProceed && (
                <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-300 px-4 py-3">
                  <span className="text-lg leading-none">⚠️</span>
                  <p className="text-sm text-amber-800">
                    <span className="font-semibold">Action needed:</span>{' '}
                    {!termColumn && !contextColumn
                      ? 'pick a search-terms column and a context column below.'
                      : !termColumn
                        ? 'pick a search-terms column below.'
                        : 'pick a context column below.'}{' '}
                    Both are <span className="font-semibold">required</span> before you can start annotating.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StepBadge number={2} done={canProceed} />
                  <div>
                    <h3 className="font-semibold text-gray-800">
                      Map your columns <span className="text-red-500 font-normal">(both columns required)</span>
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {parseResult.rows.length} rows detected
                      {parseResult.delimiter === '\t' ? ' · tab-separated' : ' · comma-separated'}
                    </p>
                  </div>
                </div>

                {/* Intent toggle */}
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setClickIntent('term')}
                    className={`px-3 py-1.5 transition-colors ${clickIntent === 'term'
                      ? 'bg-cobalt-600 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                      }`}
                  >
                    Set search terms
                  </button>
                  <button
                    type="button"
                    onClick={() => setClickIntent('context')}
                    className={`px-3 py-1.5 border-l border-gray-200 transition-colors ${clickIntent === 'context'
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                      }`}
                  >
                    Set context
                  </button>
                </div>
              </div>

              {/* Instruction hint */}
              <p className="text-xs text-gray-400">
                {clickIntent === 'term'
                  ? '👇 Click a column below to use its values as search terms for ontology annotation.'
                  : '👇 Click a column to use as required context (e.g. description). Click again to deselect.'}
              </p>

              {/* Column grid */}
              <div className="grid grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                {parseResult.headers.map(header => (
                  <ColumnCard
                    key={header}
                    header={header}
                    sampleValues={getSampleValues(header)}
                    role={getRole(header)}
                    onClick={() => handleColumnClick(header)}
                  />
                ))}
              </div>

              {/* Selection summary */}
              {(termColumn || contextColumn) && (
                <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm space-y-1">
                  {termColumn && (
                    <p>
                      <span className="font-medium text-cobalt-700">Search terms:</span>{' '}
                      <code className="bg-cobalt-100 text-cobalt-800 px-1.5 py-0.5 rounded text-xs">{termColumn}</code>
                    </p>
                  )}
                  {!termColumn && (
                    <p className="text-amber-700 italic">⚠️ Search-terms column still required.</p>
                  )}
                  {contextColumn && (
                    <p>
                      <span className="font-medium text-emerald-700">Context column:</span>{' '}
                      <code className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-xs">{contextColumn}</code>
                    </p>
                  )}
                  {!contextColumn && (
                    <p className="text-amber-700 italic">⚠️ Context column still required.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          <div>
            <button
              type="submit"
              disabled={loading || !canProceed}
              title={!canProceed ? 'Select a search-term column and a context column above to continue' : undefined}
              className={`w-full py-3 px-6 rounded-xl font-semibold text-white transition-all duration-200
                ${canProceed && !loading
                  ? 'bg-cobalt-600 hover:bg-cobalt-700 shadow-md hover:shadow-lg'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
            >
              {loading ? 'Processing…' : 'Start Annotating →'}
            </button>
            {!canProceed && (
              <p className="text-xs text-center text-amber-700 mt-2">
                {!parseResult
                  ? 'Upload a file above, then select a search-term column and a context column to enable this button.'
                  : !termColumn && !contextColumn
                    ? '👆 Select a search-term column and a context column above to enable this button.'
                    : !termColumn
                      ? '👆 Select a search-term column above to enable this button.'
                      : '👆 Select a context column above to enable this button.'}
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}