
INSERT INTO buildings (name, building_type, address, district, location) VALUES
  ('Sample City Hall', 'municipal', '1 Example Street', 'Central',
   ST_SetSRID(ST_MakePoint(15.00, 48.00), 4326)),
  ('Sample Police Station', 'police', '5 Test Avenue', 'North',
   ST_SetSRID(ST_MakePoint(15.02, 48.03), 4326));

INSERT INTO services (name, description) VALUES
  ('Passport office', 'Applications and renewals'),
  ('Building permits', 'Construction and renovation permits');

INSERT INTO floors (building_id, level) VALUES (1, 0), (1, 1);

INSERT INTO building_services (building_id, service_id)
SELECT 1, service_id FROM services WHERE name = 'Building permits';

INSERT INTO sensors (building_id, floor_id, sensor_type, unit)
SELECT 1, floor_id, 'temp_c', 'C' FROM floors WHERE building_id = 1 AND level = 0;

INSERT INTO readings (sensor_id, recorded_at, value)
SELECT s.sensor_id, gs, 20 + 3 * sin(extract(hour FROM gs) / 24.0 * 2 * pi())
FROM sensors s
CROSS JOIN generate_series(now() - interval '1 day', now(), interval '1 hour') AS gs
WHERE s.sensor_type = 'temp_c';

INSERT INTO events (building_id, event_type, description, status)
VALUES (1, 'maintenance', 'Heating valve check on ground floor', 'open');
