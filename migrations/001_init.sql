CREATE TABLE buildings (
    building_id   SERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    building_type TEXT NOT NULL,
    address       TEXT,
    district      TEXT,
    opening_hours TEXT,
    phone         TEXT,
    email         TEXT,
    year_built    INTEGER,
    floor_area_m2 NUMERIC,
    location      geometry(Point, 4326),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE floors (
    floor_id     SERIAL PRIMARY KEY,
    building_id  INTEGER NOT NULL REFERENCES buildings(building_id) ON DELETE CASCADE,
    level        INTEGER NOT NULL
);

CREATE TABLE sensors (
    sensor_id    SERIAL PRIMARY KEY,
    building_id  INTEGER NOT NULL REFERENCES buildings(building_id) ON DELETE CASCADE,
    floor_id     INTEGER REFERENCES floors(floor_id) ON DELETE SET NULL,
    sensor_type  TEXT NOT NULL,
    unit         TEXT NOT NULL
);

CREATE TABLE readings (
    sensor_id    INTEGER NOT NULL REFERENCES sensors(sensor_id) ON DELETE CASCADE,
    recorded_at  TIMESTAMPTZ NOT NULL,
    value        DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (sensor_id, recorded_at)
);
SELECT create_hypertable('readings', 'recorded_at');

CREATE TABLE events (
    event_id     SERIAL PRIMARY KEY,
    building_id  INTEGER NOT NULL REFERENCES buildings(building_id) ON DELETE CASCADE,
    event_type   TEXT NOT NULL,
    description  TEXT,
    status       TEXT NOT NULL DEFAULT 'open',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at    TIMESTAMPTZ
);

CREATE TABLE files (
    file_id        BIGSERIAL PRIMARY KEY,
    storage_key    TEXT NOT NULL UNIQUE,
    original_name  TEXT NOT NULL,
    mime_type      TEXT NOT NULL,
    size_bytes     BIGINT NOT NULL CHECK (size_bytes >= 0),
    sha256         CHAR(64) NOT NULL,
    uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attachments (
    attachment_id  BIGSERIAL