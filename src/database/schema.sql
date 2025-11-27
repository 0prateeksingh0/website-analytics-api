-- Database Schema for Website Analytics API

-- Users table (stores registered app owners)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    profile_picture TEXT,
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('guest', 'user', 'admin', 'super_admin')),
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Apps table (stores registered websites/apps)
CREATE TABLE IF NOT EXISTS apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    app_name VARCHAR(255) NOT NULL,
    app_url VARCHAR(500),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    key_prefix VARCHAR(10) NOT NULL,
    name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    permissions JSONB DEFAULT '{"read": true, "write": true}'::jsonb,
    allowed_ips TEXT[], -- IP whitelist for API key
    rate_limit_per_hour INTEGER DEFAULT 10000,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE
);

-- Analytics Events table (partitioned for scalability)
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    event_name VARCHAR(255) NOT NULL,
    url TEXT,
    referrer TEXT,
    device VARCHAR(50),
    ip_address VARCHAR(45),
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    metadata JSONB,
    browser VARCHAR(100),
    os VARCHAR(100),
    screen_size VARCHAR(50),
    country VARCHAR(2),
    city VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Create partitions for current and future months (example for 2024-2025)
CREATE TABLE IF NOT EXISTS analytics_events_2024_02 PARTITION OF analytics_events
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

CREATE TABLE IF NOT EXISTS analytics_events_2024_03 PARTITION OF analytics_events
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');

CREATE TABLE IF NOT EXISTS analytics_events_2024_11 PARTITION OF analytics_events
    FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');

CREATE TABLE IF NOT EXISTS analytics_events_2024_12 PARTITION OF analytics_events
    FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

CREATE TABLE IF NOT EXISTS analytics_events_2025_01 PARTITION OF analytics_events
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE IF NOT EXISTS analytics_events_2025_02 PARTITION OF analytics_events
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE INDEX IF NOT EXISTS idx_apps_user_id ON apps(user_id);

CREATE INDEX IF NOT EXISTS idx_api_keys_app_id ON api_keys(app_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_analytics_app_id ON analytics_events(app_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_device ON analytics_events(device);
CREATE INDEX IF NOT EXISTS idx_analytics_composite ON analytics_events(app_id, event_name, timestamp);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_apps_updated_at BEFORE UPDATE ON apps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create partitions for analytics_events
CREATE OR REPLACE FUNCTION create_partition_if_not_exists(
    partition_date DATE
) RETURNS VOID AS $$
DECLARE
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
BEGIN
    start_date := DATE_TRUNC('month', partition_date);
    end_date := start_date + INTERVAL '1 month';
    partition_name := 'analytics_events_' || TO_CHAR(start_date, 'YYYY_MM');

    IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = partition_name
        AND n.nspname = 'public'
    ) THEN
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF analytics_events FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            start_date,
            end_date
        );
        RAISE NOTICE 'Created partition: %', partition_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to create partitions for the next N months
CREATE OR REPLACE FUNCTION create_future_partitions(months_ahead INT DEFAULT 6)
RETURNS VOID AS $$
DECLARE
    i INT;
    partition_date DATE;
BEGIN
    FOR i IN 0..months_ahead LOOP
        partition_date := DATE_TRUNC('month', CURRENT_DATE) + (i || ' months')::INTERVAL;
        PERFORM create_partition_if_not_exists(partition_date);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to drop old partitions (data retention policy)
CREATE OR REPLACE FUNCTION drop_old_partitions(months_to_keep INT DEFAULT 12)
RETURNS VOID AS $$
DECLARE
    partition_record RECORD;
    cutoff_date DATE;
BEGIN
    cutoff_date := DATE_TRUNC('month', CURRENT_DATE) - (months_to_keep || ' months')::INTERVAL;

    FOR partition_record IN
        SELECT c.relname as partition_name
        FROM pg_inherits
        JOIN pg_class c ON c.oid = pg_inherits.inhrelid
        JOIN pg_class p ON p.oid = pg_inherits.inhparent
        WHERE p.relname = 'analytics_events'
        AND c.relname ~ '^analytics_events_\d{4}_\d{2}$'
    LOOP
        -- Extract date from partition name and check if it's older than cutoff
        DECLARE
            partition_date DATE;
            year_part TEXT;
            month_part TEXT;
        BEGIN
            year_part := substring(partition_record.partition_name from 'analytics_events_(\d{4})_\d{2}');
            month_part := substring(partition_record.partition_name from 'analytics_events_\d{4}_(\d{2})');
            partition_date := (year_part || '-' || month_part || '-01')::DATE;

            IF partition_date < cutoff_date THEN
                EXECUTE format('DROP TABLE IF EXISTS %I', partition_record.partition_name);
                RAISE NOTICE 'Dropped old partition: %', partition_record.partition_name;
            END IF;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create initial future partitions (current month + 11 months ahead)
SELECT create_future_partitions(11);

-- Additional indexes for improved query performance and scalability
CREATE INDEX IF NOT EXISTS idx_analytics_country ON analytics_events(country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_browser ON analytics_events(browser) WHERE browser IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_os ON analytics_events(os) WHERE os IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_session_id ON analytics_events(session_id) WHERE session_id IS NOT NULL;

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_analytics_app_timestamp ON analytics_events(app_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_app_event_timestamp ON analytics_events(app_id, event_name, timestamp DESC);

-- Partial index for recent data (hot data)
CREATE INDEX IF NOT EXISTS idx_analytics_recent ON analytics_events(timestamp DESC) 
    WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '7 days';

-- GIN index for JSONB metadata queries
CREATE INDEX IF NOT EXISTS idx_analytics_metadata_gin ON analytics_events USING GIN (metadata);

-- B-tree index for URL prefix searches
CREATE INDEX IF NOT EXISTS idx_analytics_url ON analytics_events USING btree(url text_pattern_ops) WHERE url IS NOT NULL;

-- Materialized view for aggregated daily statistics (improves dashboard queries)
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_analytics_summary AS
SELECT 
    app_id,
    DATE(timestamp) as date,
    event_name,
    COUNT(*) as event_count,
    COUNT(DISTINCT session_id) as unique_sessions,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT device) as unique_devices,
    COUNT(DISTINCT country) as unique_countries
FROM analytics_events
GROUP BY app_id, DATE(timestamp), event_name
WITH DATA;

-- Index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_summary_unique ON daily_analytics_summary(app_id, date, event_name);
CREATE INDEX IF NOT EXISTS idx_daily_summary_date ON daily_analytics_summary(date DESC);

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_daily_analytics()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_analytics_summary;
END;
$$ LANGUAGE plpgsql;

-- Enable pg_stat_statements extension for query performance monitoring
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Enable pg_trgm for text search optimization
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Audit Logs table (for security monitoring)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    resource TEXT NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Security Events table (failed login attempts, suspicious activity)
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    ip_address VARCHAR(45),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    description TEXT,
    metadata JSONB,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for security events
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_resolved ON security_events(resolved) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events(ip_address);

-- Function to log security events
CREATE OR REPLACE FUNCTION log_security_event(
    p_event_type VARCHAR,
    p_severity VARCHAR,
    p_ip_address VARCHAR,
    p_user_id UUID,
    p_description TEXT,
    p_metadata JSONB
) RETURNS UUID AS $$
DECLARE
    v_event_id UUID;
BEGIN
    INSERT INTO security_events (event_type, severity, ip_address, user_id, description, metadata)
    VALUES (p_event_type, p_severity, p_ip_address, p_user_id, p_description, p_metadata)
    RETURNING id INTO v_event_id;
    
    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Add role index on users
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active) WHERE is_active = TRUE;

-- Add permissions index on api_keys
CREATE INDEX IF NOT EXISTS idx_api_keys_permissions ON api_keys USING GIN (permissions);


