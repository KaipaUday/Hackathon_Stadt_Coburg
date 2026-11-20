-- Wartungs- / Prüfberichte (maintenance & inspection reports) shown as pins on the map.
-- A row starts as 'pending' after upload and only appears on the map after a person
-- has checked the extracted data and pressed "Accept" ('approved').

CREATE TABLE inspection_reports (
    report_id        BIGSERIAL PRIMARY KEY,
    storage_name     TEXT NOT NULL UNIQUE,          -- file name inside uploads/inspections/
    original_name    TEXT NOT NULL,
    sha256           CHAR(64) NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),
    extraction_method TEXT,                          -- 'pymupdf' or 'tesseract'
    raw_text         TEXT,                           -- full text of the PDF
    extracted        JSONB NOT NULL DEFAULT '{}',    -- what the machine read (never edited)
    data             JSONB NOT NULL DEFAULT '{}',    -- the fields after human review
    site_address     TEXT,                           -- address of the inspected site (not the company)
    location         geometry(Point, 4326),
    building_id      INTEGER REFERENCES buildings(building_id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at      TIMESTAMPTZ
);

CREATE INDEX idx_inspection_reports_status   ON inspection_reports (status);
CREATE INDEX idx_inspection_reports_sha256   ON inspection_reports (sha256);
CREATE INDEX idx_inspection_reports_location ON inspection_reports USING GIST (location);

GRANT SELECT ON inspection_reports TO city_readonly;
GRANT SELECT, INSERT, UPDATE ON inspection_reports TO city_editor;
GRANT USAGE, SELECT ON SEQUENCE inspection_reports_report_id_seq TO city_editor;

-- Let the chat assistant (read-only user) see the reports too.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_reader') THEN
        GRANT SELECT ON inspection_reports TO agent_reader;
    END IF;
END $$;
