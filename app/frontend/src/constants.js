export const API_URL = '';

export const STEPS = {
  UPLOAD: 'upload',
  ANNOTATE: 'annotate',
  EXPORT: 'export'
};

export const ONTOLOGY_SERVICES = {
  OLS: 'ols',
  BIOPORTAL: 'bioportal',
  TIB: 'tib',
  ZOOMA: 'zooma',
  ONTOBEE: 'ontobee',
  ALL: ['ols', 'bioportal', 'tib', 'zooma', 'ontobee'],
};

export const DEFAULT_ANNOTATION_SETTINGS = {
  targetOntology: '',
  ontologyService: ONTOLOGY_SERVICES.TIB,
  bioportalApiKey: '',
  requireExactMatch: false,
  alsoSearchProperties: false,
};

export const DEFAULT_METADATA_STATE = {
  metadataBlock: [],
  datasetField: [],
  controlledVocabulary: []
};

export const TERM_TYPES = {
  DATASET_FIELD: 'datasetField',
  CONTROLLED_VOCABULARY: 'controlledVocabulary',
  EXISTING_CONTROLLED_VOCABULARY: 'existingControlledVocabulary'
};