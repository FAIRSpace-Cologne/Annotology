# Annotology

Annotology is a web-based tool that helps you attach standard **ontology terms** to the fields in a spreadsheet — for example, mapping a metadata field called "Organism Type" to a formal, machine-readable term from an ontology such as NCBIT or EFO. It's built for **domain experts and Data Stewards** who need to enrich metadata with controlled vocabulary, without having to write code or search ontology websites by hand.

Annotology runs entirely on your own computer using Docker, and is accessed through a normal web browser. No data leaves your machine except the search terms themselves, which are sent to public ontology lookup services to find matching terms.

**Repository:** https://github.com/zawyar/annotology

---

## Contents

1. [What Annotology does](#what-annotology-does)
2. [System requirements](#system-requirements)
3. [Prerequisites — installing Docker](#prerequisites)
4. [Installation](#installation)
5. [Configuration (optional API key)](#configuration)
6. [Starting Annotology](#starting-annotology)
7. [Using Annotology — step by step](#using-annotology--step-by-step)
8. [Input file format](#input-file-format)
9. [Output file format](#output-file-format)
10. [Using Annotology with Dataverse](#using-annotology-with-dataverse)
11. [Re-opening a file you've already started](#re-opening-a-file-youve-already-started)
12. [For administrators: adding lookup services & tuning match scores](#for-administrators-adding-lookup-services--tuning-match-scores)
13. [Stopping, updating, and uninstalling](#stopping-updating-and-uninstalling)
14. [Troubleshooting](#troubleshooting)
15. [Support](#support)
16. [License](#license)

---

## What Annotology does

You give Annotology a spreadsheet (TSV or CSV) with a column of terms you want to annotate — for example, the names of metadata fields, or the values in a dataset. For each term, Annotology searches one or more ontology lookup services and shows you a list of candidate matches, each with a **Query Match Score** that estimates how well the candidate's title and definition line up with your term. You pick the best match, optionally attach more specific "child" terms underneath it, and move to the next term. When you're done, Annotology exports your original spreadsheet with new columns describing the ontology term you chose for each row.

The result is a spreadsheet you can hand back to a researcher, load into a metadata system such as Dataverse, or use directly as a controlled-vocabulary reference.

---

## System Requirements

### Minimum Requirements

| Component | Requirement |
|------------|------------|
| Operating System | Windows 10/11, macOS, or Linux |
| RAM | 4 GB |
| Storage | 2 GB free disk space |
| Browser | Chrome, Firefox, Edge, or Safari |
| Internet | Required (Annotology queries public ontology services online) |

### Recommended Requirements

| Component | Recommendation |
|------------|------------|
| RAM | 8 GB or more |
| CPU | Multi-core processor |
| Storage | SSD |
| Browser | Latest version of Chrome or Firefox |

---

## Prerequisites

Before installing Annotology, Docker must be installed on your system. Docker is the free tool Annotology uses to package and run itself consistently on any computer — you don't need to know anything about Docker beyond installing it and running two commands.

### Windows

1. Download Docker Desktop: https://www.docker.com/products/docker-desktop/
2. Install Docker Desktop using the default settings.
3. Make sure:
   - Virtualization is enabled in BIOS.
   - WSL2 is enabled (Docker Desktop will prompt you for this if needed).
4. Verify the installation by opening a terminal (PowerShell or Command Prompt) and running:

```bash
docker --version
docker compose version
```

### macOS

1. Download Docker Desktop: https://www.docker.com/products/docker-desktop/
2. Install Docker Desktop.
3. Verify the installation in a terminal:

```bash
docker --version
docker compose version
```

### Linux

Install Docker Engine and Docker Compose following the official documentation: https://docs.docker.com/engine/install/

Verify the installation:

```bash
docker --version
docker compose version
```

---

## Installation

### Step 1: Get the code

If you have `git` installed, open a terminal and run:

```bash
git clone https://github.com/zawyar/annotology.git
```

If you don't use `git`, you can instead download the repository as a ZIP file from GitHub ("Code" → "Download ZIP") and unzip it anywhere on your computer.

### Step 2: Navigate to the application directory

```bash
cd annotology/app
```

Everything in the rest of this guide assumes you're running commands from this `app` folder — it's the one containing `docker-compose.yml`.

### Step 3: (Optional) Set up the BioPortal API key

Skip this step if you don't plan to use the **BioPortal** lookup service — every other service (OLS, TIB, ZOOMA, Ontobee) works out of the box with no setup. See [Configuration](#configuration) below if you do want BioPortal.

### Step 4: Start Annotology

```bash
docker compose up --build
```

The first startup may take several minutes because Docker must download the required images and the backend must download its language model. When startup is complete, the terminal will show both the `backend` and `frontend` containers running.

---

## Configuration

Annotology needs no configuration to use most of its ontology lookup services. The one exception is **BioPortal (NCBO)**, which requires a free personal API key.

To enable BioPortal:

1. Create a free account at https://bioportal.bioontology.org/account and copy your API key from the account page.
2. In the `app` folder (next to `docker-compose.yml`), copy the example environment file:

   ```bash
   cp .env.example .env
   ```

3. Open `.env` in a text editor and paste your key in:

   ```
   BIOPORTAL_API_KEY=your-key-here
   ```

4. Start (or restart) Annotology:

   ```bash
   docker compose up --build -d
   ```

If you don't set a key, BioPortal simply reports an error when selected as a search service — every other service is unaffected.

---

## Starting Annotology

Once the containers have started successfully (see [Installation](#installation)), open a web browser and navigate to:

```
http://localhost:3000
```

The Annotology web interface should now be available.

### Running in the background

To keep Annotology running without keeping a terminal window open:

```bash
docker compose up --build -d
```

You can close the terminal — the application keeps running until you stop it (see [Stopping, updating, and uninstalling](#stopping-updating-and-uninstalling)).

---

## Using Annotology — step by step

Annotology walks you through three stages: **Upload → Annotate → Export**.

### 1. Upload your file and choose your columns

1. Open Annotology in your browser and drop or select a `.tsv`, `.csv`, or `.txt` file.
2. Once the file is read, Annotology shows every column with a preview of its first few values. Click a column to mark it as the **search-terms column** (the values you want to annotate), then click a second column to mark it as the **context column** (a short description that helps the search find the right match — see [Input file format](#input-file-format)).
3. Both a search-terms column and a context column are required before you can continue. Click **Start Annotating** once both are chosen.

### 2. Annotate each term

For each unique value in your search-terms column, Annotology:

1. Sends the term (and its context) to whichever ontology lookup **services** are enabled in the **Annotation Settings** panel at the top of the screen. You can turn services on or off, restrict the search to specific ontologies (e.g. `EFO,MONDO,HP`), and (for services that support it) require an exact match or also search property values.
2. Shows the returned candidates as cards, each labelled with the term's name, definition, source ontology, and a **Query Match Score** — a 0–1 estimate of how well that candidate matches what you searched for (see [For administrators](#for-administrators-adding-lookup-services--tuning-match-scores) if you want to understand or tune how that score is computed). Scroll down within a service's results to load more candidates.
3. Click the card that best represents your term to select it. You can change your selection at any time by clicking a different card.
4. **Optional — add more specific child terms.** Once you've selected an annotation, an "Add Children Terms" panel appears. This lets you attach one or more *narrower* terms underneath your selection — for example, if you annotated a field as "Cell Line", you could additionally attach the specific cell lines used in your dataset. Click it to open a picker with two tabs:
   - **Browse related terms** — every direct child term of your selected annotation, fetched live from the ontology's hierarchy.
   - **Search for a specific term** — run an independent search (using the same lookup services) if the term you want isn't a direct child, or if the ontology has no listed children at all.

   Any terms re-imported from a previously exported file (see [Re-opening a file you've already started](#re-opening-a-file-youve-already-started)) don't support live child-term browsing, since Annotology no longer knows which service originally found them — you can still reselect the term from a fresh search to re-enable it.
5. Use **Previous / Next / Skip** to move through your terms, or click any term in the left-hand list to jump to it directly. The sidebar shows your overall progress (annotated / skipped / remaining).
6. Click **Finish & Export** when you're done (you don't have to annotate every term — skipped terms are simply left blank in the export).

### 3. Export your annotated file

The Export screen summarizes what you annotated and lets you download the finished file. See [Output file format](#output-file-format) for exactly what's in it. You can also go back to the Annotate step from here if you want to review or change anything before downloading.

---

## Input file format

Annotology accepts a **TSV, CSV, or plain-text delimited file** (tab or comma separated — Annotology detects which automatically from the first line). There's no fixed set of column names required; instead, you tell Annotology which two columns to use when you upload the file:

| Role | Required? | Purpose |
|---|---|---|
| **Search-terms column** | Yes | The values you want annotated — one ontology search is run per unique value in this column. |
| **Context column** | Yes | A short description or definition for each term. This is **not** searched directly, but it's used to help score and rank the candidates returned for that term, so the best matches — not just the closest name matches — rise to the top. |

Practical notes:

- **One row per term is not required.** If your search-terms column repeats a value across multiple rows, only the first occurrence is used to generate the search — but every matching row receives the resulting annotation on export.
- The first non-comment line is treated as the header row. Lines starting with `#` before the header are skipped as comments.
- All other columns in your file are left untouched and pass through to the export unchanged.
- A minimal example (tab-separated) is included at the repository root as [`sample.tsv`](sample.tsv):

  ```
  Title	Description
  Organism Type	What kind of organism is it
  Photosynthesis rate	How quickly CO2 is absorbed by the plant
  Human Observation	An observation performed by a human.
  ```

  Here `Title` would be chosen as the search-terms column and `Description` as the context column.

---

## Output file format

When you export, Annotology writes a new file in the same delimiter (TSV or CSV) as your original, containing:

- **Every original column**, unchanged, in its original order.
- Five new columns appended at the end:

| New column | Contents |
|---|---|
| `termURI` | The ontology term's identifier — its short form (e.g. `EFO_0000305`) if the lookup service provided one, otherwise its full IRI. |
| `termLabel` | The human-readable label of the term you selected (e.g. "asthma"). |
| `termOntology` | The ontology the term came from (e.g. `EFO`, `MONDO`). |
| `controlledVocabulary` | A JSON list of any **child terms** you attached (see step 4 above). Empty (`[]`) if you didn't add any. |
| `annotationRawJSON` | The complete, unmodified record returned by the lookup service for your selected annotation — every field it returned, not just the handful summarized in the columns above. Kept so no information about the source match is ever lost, even if it isn't shown elsewhere in the file. |

Rows for terms you skipped are left with these five columns blank.

### The `controlledVocabulary` column, in detail

This is where the **child terms** you attached to a row are recorded. Its value is a JSON array, one object per child term, e.g.:

```json
[
  {"value": "HeLa", "identifier": "CLO_0003684", "iri": "http://purl.obolibrary.org/obo/CLO_0003684", "ontology": "CLO"},
  {"value": "HEK293", "identifier": "CLO_0037372", "iri": "http://purl.obolibrary.org/obo/CLO_0037372", "ontology": "CLO"}
]
```

If you didn't attach any child terms to a row, this column is `[]`.

---

## Using Annotology with Dataverse

Annotology's output format was designed to plug directly into a **[Dataverse](https://dataverse.org/) metadata block TSV** — the file format Dataverse uses to define custom metadata fields for a dataverse installation (see Dataverse's own [Metadata Customization guide](https://guides.dataverse.org/en/latest/admin/metadatacustomization.html)). A metadata block TSV has (among others) two sections that match Annotology's output almost one-to-one:

- A `#datasetField` section, one row per metadata field, which includes a `termURI` column — exactly the same column name Annotology exports.
- A `#controlledVocabulary` section, with `DatasetField`, `Value`, `identifier`, and `displayOrder` columns describing the allowed values for a field.

### Workflow: annotating a Dataverse metadata block

1. Open your metadata block TSV (e.g. `citation.tsv` from the [Dataverse GitHub repo](https://github.com/IQSS/dataverse/tree/develop/scripts/api/data/metadatablocks)) in a spreadsheet program and copy just the `#datasetField` section — the block of rows with a `name`, `title`, and `description` column — into its own TSV file.
2. Upload that file to Annotology, using the field's `title` (or `name`) column as the **search-terms column** and its `description` column as the **context column**.
3. Annotate each field as normal. Where a field should have a controlled vocabulary, use the **Add Children Terms** picker to attach the allowed values for that field.
4. Export the annotated file. You now have, for every field:
   - a `termURI` value ready to paste straight into the metadata block TSV's own `termURI` column, and
   - a `controlledVocabulary` JSON list you can unpack into `#controlledVocabulary` rows — one row per entry, using `Value` → `Value`, `identifier` → `identifier`, and an incrementing number for `displayOrder`.
5. Reload the metadata block into your Dataverse installation with the standard Dataverse admin API, e.g.:

   ```bash
   curl http://localhost:8080/api/admin/datasetfield/load \
     -H "Content-type: text/tab-separated-values" \
     -X POST --upload-file citation.tsv
   ```

   (Substitute your own Dataverse server's admin URL. Dataverse matches on field name when reloading, so this updates the existing field definitions rather than duplicating them — see Dataverse's guide for details and cautions before reloading a block that's already in production use.)

### Annotating dataset *values*, not just field definitions

Annotology isn't limited to metadata block definitions — the same workflow works for annotating the **values** in an actual dataset (e.g. giving every distinct "Organism Type" value in a spreadsheet a formal ontology term), which you can then use to populate a Dataverse dataset's metadata directly, attach as supplementary documentation, or hand to a data steward for review. Any two-column TSV/CSV of terms-and-descriptions works, whether or not it originated in Dataverse.

---

## Re-opening a file you've already started

Annotology's export is designed to be **idempotent**: if you re-upload a file you previously exported (one that already has `termURI` / `controlledVocabulary` columns), Annotology recognizes those columns on upload and restores your previous annotations and child terms automatically, so you can pick up exactly where you left off, or hand a partially-annotated file to a colleague to continue.

One limitation: annotations restored this way are marked as **re-imported**, since Annotology no longer knows which lookup service originally found them. This doesn't affect the exported data at all, but it does mean the "Add Children Terms" browse feature isn't available for that row until you reselect the term from a fresh search (searching again and picking the same term takes a few seconds and fully restores the feature).

---

## For administrators: adding lookup services & tuning match scores

The sections below are for whoever maintains the Annotology deployment — they involve editing source files and rebuilding the Docker containers, so a little familiarity with Python or JavaScript is helpful. Everyday annotation work (everything above) doesn't require any of this.

### Adding a new ontology lookup service

Every lookup service (OLS, BioPortal, TIB, ZOOMA, Ontobee) is a self-contained adapter, so adding a new one doesn't require touching the search/scoring/export logic at all.

**Backend — `app/backend/services/`**

1. Create a new file, e.g. `app/backend/services/myservice.py`, with a class that implements the shared interface defined in [`app/backend/services/base.py`](app/backend/services/base.py):

   ```python
   from .base import OntologyServiceBase, SearchResult, ChildTerm

   class MyService(OntologyServiceBase):
       name = "myservice"  # unique key used in the registry and API responses

       def search(self, term, ontologies, rows=10, start=0, **_):
           # Call your upstream API and return (list[SearchResult], total_count)
           ...

       def get_children(self, ontology_id, iri, lang="en"):
           # Return list[ChildTerm] of direct hierarchical children, or []
           # if your service has no concept of a term hierarchy.
           ...
   ```

   `SearchResult` and `ChildTerm` (also in `base.py`) are the normalised shapes every adapter must return — study one of the existing adapters (`app/backend/services/ols.py` is the simplest) for a complete working example.

2. Register it in [`app/backend/services/registry.py`](app/backend/services/registry.py):

   ```python
   from .myservice import MyService
   _register(MyService())
   ```

   That's the only other backend change needed — `/api/annotate-term` and `/api/hierarchical-children` automatically pick up any registered service by its `name`.

**Frontend — `app/frontend/src/serviceRegistry.js`**

Add one entry so the new service appears in the settings panel and results list:

```js
myservice: {
  key: 'myservice',
  label: 'My Service',
  shortLabel: 'MyService',
  description: 'One-line description shown as a tooltip.',
  supportsExactMatch: false,
  supportsSearchProperties: false,
  childrenKey: 'myservice',   // or null if it has no children endpoint
},
```

No other frontend file needs to change — every settings toggle, results panel, and child-term picker reads from this registry.

3. Rebuild and restart:

   ```bash
   docker compose up --build -d
   ```

### Adjusting the weights behind the match score

The **Query Match Score** shown on every result card is computed entirely in one file: [`app/backend/similarity.py`](app/backend/similarity.py). It blends several signals — semantic (embedding) similarity between the term/description and the candidate's title/definition, exact-match, fuzzy lexical similarity, and definition word-overlap — each with its own weight.

The weights are plain numbers inside the `_apply_scores()` function in that file, with a comment above them explaining what each one controls and how to change them safely (the short version: each group of weights should still sum to 1 after you edit them). Restart the backend (`docker compose up --build -d`) after making a change for it to take effect.

---

## Stopping, updating, and uninstalling

### Stop the application

```bash
docker compose stop
```

### Updating Annotology

To update to the latest version:

```bash
git pull
docker compose up --build -d
```

### Uninstallation

To remove the running containers:

```bash
docker compose down
```

To remove downloaded images:

```bash
docker image prune -a
```

To delete the application completely, remove the cloned repository directory.

---

## Troubleshooting

### Docker Is Not Running

Error:

```text
Cannot connect to the Docker daemon
```

Solution:

- Start Docker Desktop.
- Wait until Docker reports that it is running.
- Retry the command.

### Port 3000 (or 5000) Is Already in Use

Error:

```text
Port 3000 is already allocated
```

Solution:

- Stop the application currently using that port.
- Or edit the port mapping (the numbers before the colon, e.g. `"3000:3000"`) in `app/docker-compose.yml`.

### BioPortal shows an error / "BIOPORTAL_API_KEY is not set"

BioPortal is the one lookup service that requires an API key. Either follow [Configuration](#configuration) to add one, or simply don't select BioPortal in Annotation Settings — every other service works without it.

### A search comes back empty

Annotology distinguishes between "genuinely no matches" and "the search itself failed" (e.g. a timeout from a slow or unfiltered query). If a search fails, a warning is shown alongside the (empty) results rather than silently looking like a normal zero-result search — try narrowing **Target Ontologies** in Annotation Settings, or trying again.

### Containers Fail to Start

Check the logs:

```bash
docker compose logs
```

For continuous monitoring:

```bash
docker compose logs -f
```

### Application Does Not Load

Verify that:

- Docker is running.
- All containers are running successfully (`docker ps`).
- Ports 3000 and 5000 are available.
- Firewall settings are not blocking local access.

---

## Support

For bug reports, feature requests, and questions, please use the GitHub Issues page:

https://github.com/zawyar/annotology/issues

---

## License

Please refer to the LICENSE file included in this repository for licensing information.
