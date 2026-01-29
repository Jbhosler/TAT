-- Grant app user (tat_user) access to all TAT tables and types.
-- Run this as a superuser (e.g. postgres) after init-db.sql or if you see "permission denied for table ...".

-- Schema and tables
GRANT USAGE ON SCHEMA public TO tat_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tat_user;

-- Sequences (if any; UUID defaults may not use them)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tat_user;

-- Enum types (required to read/write columns using these types)
GRANT USAGE ON TYPE asset_class_enum TO tat_user;
GRANT USAGE ON TYPE mapping_status_enum TO tat_user;

-- Future tables created in public (optional; helps if you add tables later)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tat_user;
