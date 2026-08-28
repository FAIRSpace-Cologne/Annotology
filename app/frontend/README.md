# Annotology — Frontend

A React single-page app that walks a user through annotating the values in a TSV/CSV file with ontology terms, drawing on multiple ontology lookup services in parallel. This document is a technical reference for developers working on the frontend; for how to install and use the application itself, see the [repository README](../../README.md).

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Application Flow](#application-flow)
4. [Component Reference](#component-reference)
5. [Custom Hooks](#custom-hooks)
6. [The Service Registry](#the-service-registry)
7. [Services (`apiService.js`)](#services-apiservicejs)
8. [Utilities (`tsvParser.js`)](#utilities-tsvparserjs)
9. [Key Data Shapes](#key-data-shapes)
10. [Backend API Contract](#backend-api-contract)
11. [Configuration](#configuration)
12. [Adding a New Ontology Service](#adding-a-new-ontology-service)
13. [Known Quirks & Gotchas](#known-quirks--gotchas)

---

## Tech Stack

| Concern | Library |
|---|---|
| UI framework | React (functional components + hooks) |
| Styling | Tailwind CSS (utility classes only) |
| HTTP client | Axios |
| Delimited-file parsing / export | Custom (`utils/tsvParser.js`) |

## Project Structure

```
src/
├── components/
│   ├── AnnotateStep.jsx          # Step 2 layout shell
│   ├── AnnotationSettings.jsx    # Always-visible settings panel (service toggles, target ontologies)
│   ├── ErrorDisplay.jsx          # Fixed bottom-right error toast
│   ├── ExportStep.jsx            # Step 3 — review & download
│   ├── LoadingOverlay.jsx        # Full-screen loading spinner
│   ├── Modals.jsx                # ConfirmModal, InfoModal, CVModal
│   ├── UploadStep.jsx            # Step 1 — file upload + column mapping
│   └── annotate/
│       ├── AddChildrenTermsPrompt.jsx  # "Add Children Terms" call-to-action + chip list
│       ├── CurrentTermHeader.jsx       # Active term card
│       ├── MappingsList.jsx            # Per-service ontology results grid
│       ├── NavigationFooter.jsx        # Prev / Refresh / Skip / Finish / Next
│       └── Sidebar.jsx                 # TermList, QuickSearch, SessionControl, OntologyUsagePanel, QuickStatsBar
├── hooks/
│   └── useAnnotation.js          # All annotation-related custom hooks
├── services/
│   └── apiService.js             # searchService/searchServices/scoreMapping/fetchHierarchicalChildren
├── utils/
│   └── tsvParser.js              # Parse + export delimited files
├── serviceRegistry.js            # Frontend source-of-truth for every ontology service
├── constants.js                  # STEPS, ONTOLOGY_SERVICES, defaults
└── App.js                        # Top-level state + wiring; no global store
```

> **Note:** imports inside components use paths like `'./annotate/Sidebar'` — the `annotate/` sub-folder must exist at the same level as `AnnotateStep.jsx`.

---

## Application Flow

### Step 1 — Upload (`UploadStep`)

1. The user drops or selects a `.tsv`, `.csv`, or `.txt` file.
2. `parseDelimitedFile` (`utils/tsvParser.js`) auto-detects the delimiter (tab vs. comma, by counting occurrences in the header line) and parses the file into `{ headers, rows, delimiter }`.
3. The user clicks a column to mark it as the **term column**, then a second column as the **context column**. Both are required before continuing.
4. On submit, `App.handleFileUpload` calls `extractTermsFromColumn` to build the `terms` array (deduplicated by term value), and — if the file already has a `termURI` column (i.e. it's a re-imported export) — reconstructs `selectedAnnotations` and `cvValues` from the existing `termURI` / `termLabel` / `termOntology` / `controlledVocabulary` columns before advancing to Step 2. See [Known Quirks & Gotchas](#known-quirks--gotchas) for the caveat on re-imported annotations.

### Step 2 — Annotate (`AnnotateStep`)

Driven by `currentTermIndex`:

1. `useMultiServiceAnnotations.fetchAnnotations()` fires whenever `currentTermIndex` changes (or settings are applied), issuing one independent search per active service via `searchOneService` — each service's panel in `resultsByService` fills in as soon as its own response lands, with no waiting on the others. A `currentRequestIdRef` timestamp guards every in-flight request; any response that arrives after the user has already navigated elsewhere is discarded (see [Known Quirks & Gotchas](#known-quirks--gotchas)).
2. From the second annotated term onward, an additional "preferred ontologies" row is fetched (`fetchPreferredRow`), scoped to whichever ontologies the user has already picked terms from and merged/deduplicated across services — a shortcut to "the ontology you keep using", shown above the per-service panels.
3. Each returned mapping is initially unscored; `rankMappings`/`rankPreferredMappings` fire one `/api/score-mapping` request per mapping (not batched) so each card's **Query Match Score** fills in independently as its own response arrives.
4. The user clicks a card → `App.handleSelectAnnotation(mapping)` stores a normalized annotation object in `selectedAnnotations[term.id]` (see [Key Data Shapes](#key-data-shapes)).
5. Once a term has a selected annotation, `AddChildrenTermsPrompt` appears below the results list. Opening it (`handleOpenCVModal`) resolves which backend service to query for children via `childrenServiceForAnnotation` (matches the annotation's `source` string against the registry), then calls `fetchHierarchicalChildren`. Selected child terms are stored per-field in `cvValues[field_name]`.
6. Navigation (Prev / Next / Skip / Finish) is handled by `NavigationFooter`, wired up in `App.js`.

### Step 3 — Export (`ExportStep`)

1. Stats and a preview of `selectedAnnotations` are shown.
2. On download, `App.handleExport` calls `generateAnnotatedContent(rows, headers, selectedAnnotations, termColumn, delimiter, cvValues)`, which appends `termURI`, `termLabel`, `termOntology`, `controlledVocabulary`, and `annotationRawJSON` columns (see the root README's [Output file format](../../README.md#output-file-format) for the exact contents of each) and re-serializes every row, matched back to its annotation by term value.
3. The file is downloaded via a programmatically created `<a download>` element; app state is then reset back to Step 1.

---

## Component Reference

### `UploadStep`

Drag-and-drop zone (accepts `.tsv`, `.csv`, `.txt`) plus a two-column-picker UI (`ColumnCard` grid) for choosing the term and context columns. Submitting calls `onSubmit(e, { termColumn, contextColumn, parseResult })`.

### `AnnotateStep`

The layout shell for Step 2 — owns no state of its own, just threads props down to:

| Region | Component |
|---|---|
| Top stats bar | `QuickStatsBar` |
| Left sidebar | `TermList` + `QuickSearch` + `SessionControl` + `OntologyUsagePanel` |
| Main panel | `AnnotationSettings` + `CurrentTermHeader` + `MappingsList` + `AddChildrenTermsPrompt` + `NavigationFooter` |

### `AnnotationSettings`

Always-visible (not collapsible — user testing showed a collapsed panel caused people to miss it) panel controlling:

- **Ontology Services** — one checkbox per entry in `SERVICE_REGISTRY`; multiple can be active simultaneously, each rendering its own independent results panel.
- **Target Ontologies** — a free-text, comma-separated list of ontology IDs (e.g. `EFO,MONDO,HP`), or blank for "search everything".
- **Capability-gated options** (`CapabilitySettings`) — "Require exact match" / "Also search properties" checkboxes appear only when at least one active service advertises support for them (`supportsExactMatch` / `supportsSearchProperties` in the registry).

Settings auto-apply ~900ms after the user stops editing (`settingsDebounceRef` in `App.js`), with a "changes pending" banner + "Apply Now" button shown in the interim so the debounce is never silent.

### `CurrentTermHeader`

Displays the active term's title, type badge, and context text, plus a copy-to-clipboard button. Shows an "✓ Annotated" badge once `selectedAnnotations[currentTerm.id]` exists.

### `MappingsList`

Renders one card grid per active service (`resultsByService[key]`), plus the merged "preferred ontologies" row when applicable. Infinite-scrolls each panel independently via `useInfiniteScroll`. Cards are **not deduplicated across services** by design — the same ontology concept found by two services is shown twice, once per panel — but *are* deduplicated within the merged preferred-ontologies row.

### `AddChildrenTermsPrompt`

The entry point for attaching narrower ("child") terms to the current annotation. Shows a running count and the terms already added; opens `CVModal` via `onOpenCVModal`.

### `NavigationFooter`

Prev / Refresh / Skip / Finish / Next buttons plus a dual progress bar (position in list + annotated count).

### `Sidebar` (named exports)

| Export | Purpose |
|---|---|
| `TermList` | Scrollable list of all terms; click to jump directly to one |
| `QuickSearch` | Live filter over term/context text, with a jump-to-result dropdown |
| `SessionControl` | "Finish & Export" shortcut |
| `OntologyUsagePanel` | Tally of which ontologies the user has picked from so far, most-used first |
| `QuickStatsBar` | Annotated / Skipped / Remaining / Total counters + "Clear All" |

### `Modals`

Three named exports:

- **`ConfirmModal`** — generic confirmation dialog (Cancel / Confirm).
- **`InfoModal`** — informational dialog with a single OK button.
- **`CVModal`** — the child-term picker. Two tabs: **Browse related terms** (the live hierarchical-children fetch triggered on open) and **Search for a specific term** (an independent search across the same lookup services, for cases with no listed children). Both tabs render through the same `TermCard`, since ontology search results are normalized (`mappingToCVTerm`) into the same shape as hierarchical children before display.

### `ErrorDisplay`

Fixed bottom-right toast. Renders `null` when `error` is falsy.

### `LoadingOverlay`

Full-screen overlay shown while a file is being parsed on Step 1 → Step 2 transition.

### `ExportStep`

Summary screen: stats grid, first-5 annotations preview, an "Export Details" checklist describing the new output columns, and Download / Back / Start New actions.

---

## Custom Hooks

All hooks live in `hooks/useAnnotation.js`.

### `useAnnotationStats(terms, selectedAnnotations, currentTermIndex)`

Derives `{ total, annotated, skipped, remaining }`.

### `useTermFilter(terms, searchQuery)`

Returns terms whose `term` or `context` matches `searchQuery` (case-insensitive); `[]` when the query is empty.

### `useMultiServiceAnnotations(terms, currentTermIndex, annotationSettings, currentRequestIdRef, usedOntologies)`

The core orchestration hook. Returns:

```js
{
  resultsByService,       // { [serviceKey]: { mappings, total, start, hasMore, loading, loadingMore, error, warning } }
  activeServiceKeys,      // resolved from annotationSettings.ontologyService
  preferredResults,       // same shape, for the merged "preferred ontologies" row
  hasPreferredRow,        // usedOntologies.length > 0
  fetchAnnotations,       // (re)search every active service + the preferred row, for the current term
  loadMoreForService,     // (serviceKey) => next page for one service's panel
  loadMorePreferredRow,   // next page for the preferred row
}
```

Each service's slot in `resultsByService` is populated and paginated completely independently — one service's request never blocks or is merged with another's, except in the separate `preferredResults` row, which deliberately does merge and deduplicate by IRI across services.

### `useInfiniteScroll(containerRef, hasMoreResults, isLoadingMore, currentMappingsLength, onLoadMore)`

Attaches a `scroll` listener to a container ref; calls `onLoadMore` within 100px of the bottom. Used once per results panel, so scrolling one small panel never triggers another's load-more.

---

## The Service Registry

`serviceRegistry.js` is the frontend's single source of truth for every ontology lookup service. It mirrors the backend's `services/registry.py` by service `key`. See [Adding a New Ontology Service](#adding-a-new-ontology-service) below for the full recipe; in short, every UI surface (settings checkboxes, capability toggles, results panels, children-fetch routing, footer credits) reads from this file — none of them hardcode a service name.

---

## Services (`apiService.js`)

Wraps Axios calls to the backend. All ontology search flows through one small adapter map (`SEARCH_ADAPTERS`), keyed by service, so adding a service only means adding one adapter function here (see [Adding a New Ontology Service](#adding-a-new-ontology-service)).

### `searchService(serviceKey, term, description, config, currentRequestId, currentRequestIdRef)`

Searches exactly one service via `POST /api/annotate-term`, with `service: serviceKey` in the body. Returns `{ mappings, total, warning }`, mappings normalized (`normalizeMapping`) into the shared shape described below. This is what powers each independent per-service panel in `MappingsList`.

### `searchServices(term, description, config, currentRequestId, currentRequestIdRef)`

Convenience wrapper used only by the CV modal's "search for a specific term" tab: runs `searchService` across several (or, if `config.activeServices` is omitted, all registered) services via `Promise.allSettled` and returns one flat, **not deduplicated**, combined list — a service failing doesn't prevent the others' results from showing.

### `scoreMapping(term, description, mapping)`

`POST /api/score-mapping` — ranks a single mapping against the term/description it was found for. Called once per mapping so results can be scored concurrently and filled in as each response lands, in any order.

### `fetchHierarchicalChildren(ontologyPrefix, iri, parentLabel, service = 'ols')`

`GET /api/hierarchical-children` — returns the array of child-term objects used to populate `CVModal`'s "Browse related terms" tab.

---

## Utilities (`tsvParser.js`)

### `detectDelimiter(content)`

Compares tab vs. comma counts in the first line; ties go to tab.

### `parseDelimitedFile(fileContent)`

Returns `{ headers, rows, delimiter }`. Skips leading `#`-prefixed comment lines before the header. Does not handle quoted delimiters/newlines inside values on the *input* side (only the export side quotes fields — see below).

### `extractTermsFromColumn(rows, termColumn, contextColumn)`

Builds the `terms` array (see [Key Data Shapes](#key-data-shapes)), deduplicated by the term column's value — if the same value appears in multiple rows, only the first becomes a `Term`, but every matching row still receives that term's annotation on export.

### `generateAnnotatedContent(rows, headers, selectedAnnotations, termColumn, delimiter, cvValues)`

Reconstructs the full delimited file, appending `termURI`, `termLabel`, `termOntology`, `controlledVocabulary`, and `annotationRawJSON` columns. Values that contain the delimiter, a quote character, or a newline are CSV-style quoted (`csvSafe`) — this matters most for `annotationRawJSON`, which is virtually guaranteed to contain the delimiter itself.

---

## Key Data Shapes

### `Term`

```ts
{
  id: string;              // "row_<index>"
  term: string;             // value from the term column
  type: 'datasetField';
  context: string;          // value from the context column
  field_name: string;       // == term, used as the key for cvValues
  field_type: string;       // currently always ''
  original_data: Row;       // the full original row
  row_index: number;
}
```

### `Mapping` (normalized shape, shared across all services)

```ts
{
  'Mapped Term IRI': string;
  'Mapped Term Label': string;
  'Mapped Term Ontology': string;
  'Class Name': string;
  'Class Definition': string;
  'Detailed Ontology': string;
  'Source': string;               // e.g. 'OLS v4', 'BioPortal', 'TIB', ...
  'Match Type': string;
  'Is Defining Ontology': boolean;
  'Score': number;
  'Short Form': string;
  'Query Match Score': number;    // 0 until scoreMapping() has been called for this mapping
  'Query Match Details': object | null;
  '_raw': object;                 // the untouched raw record from normalizeMapping's input
  // ...plus any other service-specific fields the backend returned
}
```

### Selected annotation (stored in `App`'s `selectedAnnotations[term.id]`)

```ts
{
  term: string;
  term_id: string;
  type: string;
  iri: string;
  label: string;
  ontology: string;
  definition: string;
  synonyms: string[];
  field_name: string;
  short_form: string;
  source: string;          // used by childrenServiceForAnnotation to route CV fetches
  raw_mapping: object;     // the complete mapping as selected, exported verbatim as annotationRawJSON
}
```

### CV (child) term (stored in `App`'s `cvValues[field_name]`)

```ts
{
  id: string;
  term: string;
  type: 'controlledVocabulary';
  field_name: string;
  DatasetField: string;
  Value: string;
  identifier: string;
  displayOrder: number;
  iri: string;
  ontology: string;
  definition: string;
  synonyms: string[];
  isNewlyAdded: boolean;
  short_form: string;
  cui: string[];
  semantic_type: string[];
}
```

### `AnnotationSettings`

```ts
{
  targetOntology: string;             // e.g. "EFO,MONDO" or "" for all
  ontologyService: string | string[]; // one key, or several, from SERVICE_REGISTRY
  requireExactMatch: boolean;
  alsoSearchProperties: boolean;
}
```

---

## Backend API Contract

The frontend calls a Flask server at the URL exported from `constants.js` as `API_URL` (empty string by default — same-origin, proxied by nginx in production; see `nginx.conf`).

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/annotate-term` | POST | Search one or more terms against a chosen `service` |
| `/api/score-mapping` | GET → POST | Rank one mapping against a term/description |
| `/api/hierarchical-children` | GET | Fetch a term's direct children from a chosen `service` |
| `/api/health` | GET | Health check; also lists every registered service name |

All endpoints return `{ success: boolean, ... }`; on failure, `success: false` with an `error` string. See [`app/backend/app.py`](../backend/app.py) for the full request/response shape of each route (documented in each route's docstring).

---

## Configuration

| Constant | File | Description |
|---|---|---|
| `API_URL` | `constants.js` | Base URL for all backend requests (blank = same origin) |
| `ONTOLOGY_SERVICES` | `constants.js` | Convenience enum of the built-in service keys |
| `DEFAULT_ANNOTATION_SETTINGS` | `constants.js` | Initial `AnnotationSettings` (default active service: `tib`) |
| `SERVICE_REGISTRY` | `serviceRegistry.js` | Full per-service metadata; see below |

---

## Adding a New Ontology Service

This is the recipe summarized in the [root README](../../README.md#for-administrators-adding-lookup-services--tuning-match-scores); the frontend-specific half is:

1. Implement the backend adapter first (`app/backend/services/`) — see [`services/registry.py`](../backend/services/registry.py) and [`services/base.py`](../backend/services/base.py).
2. Add one search adapter function to `SEARCH_ADAPTERS` in `services/apiService.js`, following the pattern of the existing ones (they differ only in which optional params they forward — e.g. `require_exact_match` for BioPortal/TIB):

   ```js
   myservice: async ({ term, description, targetOntology, rows = 5, start = 0, currentRequestId, currentRequestIdRef }) => {
     const response = await axios.post(`${API_URL}/api/annotate-term`, {
       terms: [term],
       descriptions: [description],
       target_ontology: targetOntology,
       rows,
       start,
       service: 'myservice',
     });
     if (isStale(currentRequestId, currentRequestIdRef)) return staleResult();
     if (response.data.success === false) throw new Error(response.data.error);
     const [first] = response.data.results ?? [];
     return {
       mappings: (first?.mappings ?? []).map(normalizeMapping),
       total: first?.total ?? 0,
       warning: response.data.warning,
     };
   },
   ```

3. Add the corresponding entry to `SERVICE_REGISTRY` in `serviceRegistry.js` (see the doc-comment at the top of that file for the exact shape). This single entry is enough to make the new service show up as a settings checkbox, get its own results panel, take part in the "preferred ontologies" row, and (if `childrenKey` is set) participate in the child-term picker.

No other frontend file needs to change.

---

## Known Quirks & Gotchas

**Stale request cancellation** — There is no actual HTTP cancellation (no `AbortController`). Instead, every fetch receives a timestamp `requestId`; responses whose ID doesn't match `currentRequestIdRef.current` at the time they resolve are silently discarded. Navigating quickly between terms fires multiple requests, but only the latest one's results are applied.

**IRI-based selection highlight** — `MappingsList` highlights a card by comparing `selectedAnnotations[currentTerm.id]['Mapped Term IRI']`-equivalent fields against the card's `'Mapped Term IRI'`. Renaming that key on one side without the other silently breaks the highlight.

**No cross-service deduplication in the main panels** — Each service's `resultsByService[key]` is shown as-is, including its own upstream `total`; the same concept appearing under two services is expected and intentional. Only the merged `preferredResults` row deduplicates, by `Mapped Term IRI`.

**Re-imported annotations can't fetch children live** — Rows restored from a previously exported file are tagged `source: 'Re‑imported'`, since the original service that found them isn't known. `handleOpenCVModal` detects this and shows an explanatory dialog instead of attempting a fetch; reselecting the term from a fresh search resolves it.

**`ontologyService` may be a bare string or an array** — When only one service is active, `AnnotationSettings` stores a plain string (e.g. `'ols'`) rather than a one-element array, for backwards compatibility with any code doing `=== 'ols'`. Anything consuming it must go through `resolveServiceKeys()` (`serviceRegistry.js`) rather than assuming array methods work directly.

**Delimited-file parsing does not handle quoted delimiters on input** — `parseDelimitedFile` splits naively on the detected delimiter; a value containing a literal tab/comma inside quotes on the *input* file will misalign columns. The *export* path (`generateAnnotatedContent`) does correctly quote such values on the way out.
