
CREATE TABLE services (
    service_id   SERIAL PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    description  TEXT
);

CREATE TABLE building_services (
    building_id  INTEGER NOT NULL REFERENCES buildings(building_id) ON DELETE CASCADE,
    service_id   INTEGER NOT NULL REFERENCES services(service_id) ON DELETE CASCADE,
    PRIMARY KEY (building_id, service_id)
);

CREATE INDEX idx_building_services_service ON building_services (service_id);
