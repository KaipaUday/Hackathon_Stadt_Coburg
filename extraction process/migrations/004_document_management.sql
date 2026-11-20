BEGIN;

CREATE TABLE IF NOT EXISTS files (
 file_id BIGSERIAL PRIMARY KEY,
 storage_key TEXT NOT NULL UNIQUE,
 original_name TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
 sha256 CHAR(64) NOT NULL,
 uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_files_sha256 ON files(sha256);

CREATE TABLE IF NOT EXISTS document_metadata (
 document_id BIGSERIAL PRIMARY KEY,
 file_id BIGINT NOT NULL UNIQUE REFERENCES files(file_id) ON DELETE CASCADE,
 document_type TEXT, title TEXT, description TEXT, language TEXT,
 document_date DATE, author TEXT, organization TEXT,
 classification_confidence NUMERIC(5,2),
 review_status TEXT NOT NULL DEFAULT 'pending'
 CHECK (review_status IN ('pending','approved','rejected','requires_review')),
 reviewed_at TIMESTAMPTZ, reviewed_by TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS extraction_jobs (
 job_id BIGSERIAL PRIMARY KEY,
 file_id BIGINT NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending'
 CHECK (status IN ('pending','processing','completed','failed','requires_review')),
 extraction_method TEXT, extractor_version TEXT,
 started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, error_message TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_status ON extraction_jobs(status);

CREATE TABLE IF NOT EXISTS extracted_text (
 extraction_id BIGSERIAL PRIMARY KEY,
 file_id BIGINT NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
 page_number INTEGER, content TEXT NOT NULL,
 extraction_method TEXT, language TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_extracted_text_file ON extracted_text(file_id);

CREATE TABLE IF NOT EXISTS extracted_data (
 extraction_id BIGSERIAL PRIMARY KEY,
 file_id BIGINT NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
 data_type TEXT NOT NULL, extracted_content JSONB NOT NULL,
 source_page INTEGER, confidence NUMERIC(5,2),
 review_status TEXT NOT NULL DEFAULT 'pending'
 CHECK (review_status IN ('pending','approved','rejected')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_extracted_data_content
 ON extracted_data USING GIN(extracted_content);

CREATE TABLE IF NOT EXISTS document_buildings (
 file_id BIGINT NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
 building_id INTEGER NOT NULL REFERENCES buildings(building_id) ON DELETE CASCADE,
 relationship_type TEXT DEFAULT 'related', confidence NUMERIC(5,2),
 PRIMARY KEY(file_id, building_id)
);

CREATE TABLE IF NOT EXISTS document_audit (
 audit_id BIGSERIAL PRIMARY KEY,
 file_id BIGINT NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
 action TEXT NOT NULL, performed_by TEXT, details JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMIT;
