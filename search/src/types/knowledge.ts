export type DocType =
  | 'Brandschutzkonzept'
  | 'Prüfbericht'
  | 'Wartungsvertrag'
  | 'Rechnung'
  | 'GAEB-LV'
  | 'E-Mail'
  | 'Bauplan'
  | 'Typenschild-Foto'
  | 'Aktenvermerk'
  | 'Anlagenkataster';

export type AssetStatus =
  | 'compliant'
  | 'due_soon'
  | 'overdue'
  | 'missing_proof'
  | 'defect_reported';

export interface DocumentChunk {
  chunk_id: string;
  page_or_section: string;
  text: string;
}

export interface ExtractedFact {
  label: string;
  value: string;
  page_or_section: string;
  quote: string;
}

export interface DocumentRecord {
  doc_id: string;
  filename: string;
  extension: string;
  file_path: string;
  doc_type: DocType;
  doc_date: string;
  building: string;
  summary: string;
  source_origin: 'sample' | 'uploaded';
  chunks: DocumentChunk[];
  extracted_facts: ExtractedFact[];
  linked_asset_ids: string[];
  uploaded_at: string;
}

export interface AssetRecord {
  asset_id: string;
  building: string;
  floor_room: string;
  category: string;
  name: string;
  manufacturer: string;
  model_or_spec: string;
  install_year: string;
  inspection_interval: string;
  last_inspection: string;
  next_inspection_due: string;
  status: AssetStatus;
  status_note: string;
  estimated_cost_eur: number | null;
  linked_doc_ids: string[];
  confidence: number;
  needs_review: boolean;
  review_reason: string;
  human_verified: boolean;
  human_note?: string;
}

export interface KnowledgeBase {
  portfolio_name: string;
  buildings: string[];
  documents: DocumentRecord[];
  assets: AssetRecord[];
  last_updated: string;
}

export interface SearchCitation {
  doc_id: string;
  filename: string;
  doc_type: string;
  page_or_section: string;
  quote: string;
}

export interface AnalysisFinding {
  title: string;
  asset_id: string;
  building: string;
  finding_type: AssetStatus;
  detail: string;
  doc_id: string;
  quote: string;
}

export interface AskResponse {
  query: string;
  answer: string;
  findings: AnalysisFinding[];
  citations: SearchCitation[];
  data_gaps: string[];
  uncertainties_noted: string[];
  retrieved_doc_count: number;
  analyzed_asset_count: number;
}

export interface ChunkSearchHit {
  doc_id: string;
  filename: string;
  doc_type: DocType;
  doc_date: string;
  building: string;
  chunk_id: string;
  page_or_section: string;
  snippet: string;
  score: number;
  linked_asset_ids: string[];
}
