SELECT create_hypertable('pose_frames', by_range('captured_at'), if_not_exists => TRUE, migrate_data => TRUE);
