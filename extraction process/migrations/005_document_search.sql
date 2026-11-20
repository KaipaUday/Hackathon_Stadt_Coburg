BEGIN;
ALTER TABLE extracted_text ADD COLUMN IF NOT EXISTS search_vector TSVECTOR
GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content,''))) STORED;
CREATE INDEX IF NOT EXISTS idx_extracted_text_search
 ON extracted_text USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_document_metadata_type ON document_metadata(document_type);
CREATE INDEX IF NOT EXISTS idx_document_metadata_status ON document_metadata(review_status);
COMMIT;
