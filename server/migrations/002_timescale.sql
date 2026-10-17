CREATE EXTENSION IF NOT EXISTS timescaledb;
SELECT create_hypertable('hand_frames', by_range('captured_at'), if_not_exists => TRUE, migrate_data => TRUE);
