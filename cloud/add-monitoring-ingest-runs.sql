-- Record each aggregated holdings ingest run so we know when a "new file" was ingested.
-- Heat map data is only computed and saved during ingest; this table supports
-- "calculation only when a new file has been ingested" and last_ingest_at for the UI.

CREATE TABLE IF NOT EXISTS monitoring_ingest_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ingested_count INTEGER NOT NULL DEFAULT 0,
    as_of_date DATE,
    file_checksum VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_monitoring_ingest_runs_ingested_at ON monitoring_ingest_runs(ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_ingest_runs_file_checksum ON monitoring_ingest_runs(file_checksum);

CREATE TRIGGER update_monitoring_ingest_runs_updated_at BEFORE UPDATE ON monitoring_ingest_runs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE monitoring_ingest_runs IS 'One row per successful aggregated holdings ingest; used to skip duplicate files and to expose last_ingest_at for heat map.';
