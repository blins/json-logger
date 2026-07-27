CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE t_logs ( 
    time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    js jsonb 
);

SELECT create_hypertable('t_logs', 'time', chunk_time_interval => INTERVAL '1 day');
SELECT add_retention_policy('t_logs', INTERVAL '90 days');
SELECT drop_chunks('t_logs', older_than => INTERVAL '90 days');

