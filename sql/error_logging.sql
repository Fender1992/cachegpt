-- Error Logging Tables
-- Run this script to add error logging tables to the database

-- Error Logs Table
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_id TEXT NOT NULL UNIQUE,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  method TEXT,
  url TEXT,
  client_ip INET,
  user_agent TEXT,
  processing_time DECIMAL(10,6),
  error_code TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  stack_trace TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- API Metrics Table
CREATE TABLE IF NOT EXISTS api_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER NOT NULL,
  request_size INTEGER DEFAULT 0,
  response_size INTEGER DEFAULT 0,
  user_id UUID REFERENCES auth.users(id),
  client_ip INET,
  user_agent TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- System Health Checks Table
CREATE TABLE IF NOT EXISTS health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy')),
  response_time_ms INTEGER,
  error_message TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  checked_at TIMESTAMP DEFAULT NOW()
);

-- Rate Limit Violations Table
CREATE TABLE IF NOT EXISTS rate_limit_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_ip INET NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  endpoint TEXT NOT NULL,
  limit_type TEXT NOT NULL,
  limit_value INTEGER NOT NULL,
  current_count INTEGER NOT NULL,
  window_seconds INTEGER NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Security Incidents Table
CREATE TABLE IF NOT EXISTS security_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  client_ip INET,
  user_id UUID REFERENCES auth.users(id),
  endpoint TEXT,
  user_agent TEXT,
  request_data JSONB DEFAULT '{}'::jsonb,
  response_data JSONB DEFAULT '{}'::jsonb,
  detected_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'false_positive'))
);

-- Performance Metrics Table
CREATE TABLE IF NOT EXISTS performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name TEXT NOT NULL,
  metric_value DECIMAL(15,6) NOT NULL,
  metric_unit TEXT,
  tags JSONB DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_error_logs_error_id ON error_logs (error_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_status_code ON error_logs (status_code);
CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON error_logs (error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_api_metrics_endpoint ON api_metrics (endpoint);
CREATE INDEX IF NOT EXISTS idx_api_metrics_timestamp ON api_metrics (timestamp);
CREATE INDEX IF NOT EXISTS idx_api_metrics_status_code ON api_metrics (status_code);
CREATE INDEX IF NOT EXISTS idx_api_metrics_user_id ON api_metrics (user_id);

CREATE INDEX IF NOT EXISTS idx_health_checks_service_name ON health_checks (service_name);
CREATE INDEX IF NOT EXISTS idx_health_checks_checked_at ON health_checks (checked_at);
CREATE INDEX IF NOT EXISTS idx_health_checks_status ON health_checks (status);

CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_client_ip ON rate_limit_violations (client_ip);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_created_at ON rate_limit_violations (created_at);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_user_id ON rate_limit_violations (user_id);

CREATE INDEX IF NOT EXISTS idx_security_incidents_incident_type ON security_incidents (incident_type);
CREATE INDEX IF NOT EXISTS idx_security_incidents_severity ON security_incidents (severity);
CREATE INDEX IF NOT EXISTS idx_security_incidents_detected_at ON security_incidents (detected_at);
CREATE INDEX IF NOT EXISTS idx_security_incidents_status ON security_incidents (status);
CREATE INDEX IF NOT EXISTS idx_security_incidents_client_ip ON security_incidents (client_ip);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_metric_name ON performance_metrics (metric_name);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_recorded_at ON performance_metrics (recorded_at);

-- Functions for error analysis and reporting

-- Function to get error rate for a time period
CREATE OR REPLACE FUNCTION get_error_rate(
  start_time TIMESTAMP DEFAULT NOW() - INTERVAL '1 hour',
  end_time TIMESTAMP DEFAULT NOW()
)
RETURNS TABLE (
  total_requests BIGINT,
  error_requests BIGINT,
  error_rate DECIMAL(5,2)
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH error_stats AS (
    SELECT
      COUNT(*) as total_errors,
      COUNT(*) FILTER (WHERE status_code >= 400) as client_errors,
      COUNT(*) FILTER (WHERE status_code >= 500) as server_errors
    FROM error_logs
    WHERE created_at BETWEEN start_time AND end_time
  ),
  api_stats AS (
    SELECT COUNT(*) as total_api_requests
    FROM api_metrics
    WHERE timestamp BETWEEN start_time AND end_time
  )
  SELECT
    COALESCE(a.total_api_requests, 0) + COALESCE(e.total_errors, 0) as total_requests,
    COALESCE(e.total_errors, 0) as error_requests,
    CASE
      WHEN COALESCE(a.total_api_requests, 0) + COALESCE(e.total_errors, 0) > 0
      THEN ROUND(
        (COALESCE(e.total_errors, 0)::decimal / (COALESCE(a.total_api_requests, 0) + COALESCE(e.total_errors, 0))) * 100,
        2
      )
      ELSE 0
    END as error_rate
  FROM error_stats e
  CROSS JOIN api_stats a;
END;
$$;

-- Function to get top error types
CREATE OR REPLACE FUNCTION get_top_errors(
  start_time TIMESTAMP DEFAULT NOW() - INTERVAL '24 hours',
  end_time TIMESTAMP DEFAULT NOW(),
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  error_type TEXT,
  error_code TEXT,
  count BIGINT,
  percentage DECIMAL(5,2)
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH error_counts AS (
    SELECT
      e.error_type,
      e.error_code,
      COUNT(*) as count,
      COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() as percentage
    FROM error_logs e
    WHERE e.created_at BETWEEN start_time AND end_time
    GROUP BY e.error_type, e.error_code
    ORDER BY count DESC
    LIMIT limit_count
  )
  SELECT
    ec.error_type,
    ec.error_code,
    ec.count,
    ROUND(ec.percentage, 2) as percentage
  FROM error_counts ec;
END;
$$;

-- Function to record performance metric
CREATE OR REPLACE FUNCTION record_performance_metric(
  metric_name_param TEXT,
  metric_value_param DECIMAL,
  metric_unit_param TEXT DEFAULT NULL,
  tags_param JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO performance_metrics (
    metric_name, metric_value, metric_unit, tags
  ) VALUES (
    metric_name_param, metric_value_param, metric_unit_param, tags_param
  );
END;
$$;

-- Function to get system health summary
CREATE OR REPLACE FUNCTION get_system_health_summary(
  time_window INTERVAL DEFAULT INTERVAL '5 minutes'
)
RETURNS TABLE (
  service_name TEXT,
  current_status TEXT,
  avg_response_time DECIMAL(10,2),
  last_check TIMESTAMP,
  error_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH latest_checks AS (
    SELECT DISTINCT ON (hc.service_name)
      hc.service_name,
      hc.status,
      hc.response_time_ms,
      hc.checked_at
    FROM health_checks hc
    WHERE hc.checked_at >= NOW() - time_window
    ORDER BY hc.service_name, hc.checked_at DESC
  ),
  error_counts AS (
    SELECT
      'api' as service_name,
      COUNT(*) as error_count
    FROM error_logs
    WHERE created_at >= NOW() - time_window
      AND status_code >= 500
  )
  SELECT
    lc.service_name,
    lc.status as current_status,
    lc.response_time_ms::decimal as avg_response_time,
    lc.checked_at as last_check,
    COALESCE(ec.error_count, 0) as error_count
  FROM latest_checks lc
  LEFT JOIN error_counts ec ON lc.service_name = ec.service_name;
END;
$$;

-- Function to cleanup old logs
CREATE OR REPLACE FUNCTION cleanup_old_logs(
  retention_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  table_name TEXT,
  deleted_count BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  cutoff_date TIMESTAMP;
  deleted_error_logs BIGINT;
  deleted_api_metrics BIGINT;
  deleted_health_checks BIGINT;
  deleted_rate_limit_violations BIGINT;
  deleted_performance_metrics BIGINT;
BEGIN
  cutoff_date := NOW() - (retention_days || ' days')::INTERVAL;

  -- Clean up error logs
  DELETE FROM error_logs WHERE created_at < cutoff_date;
  GET DIAGNOSTICS deleted_error_logs = ROW_COUNT;

  -- Clean up API metrics
  DELETE FROM api_metrics WHERE timestamp < cutoff_date;
  GET DIAGNOSTICS deleted_api_metrics = ROW_COUNT;

  -- Clean up health checks
  DELETE FROM health_checks WHERE checked_at < cutoff_date;
  GET DIAGNOSTICS deleted_health_checks = ROW_COUNT;

  -- Clean up rate limit violations
  DELETE FROM rate_limit_violations WHERE created_at < cutoff_date;
  GET DIAGNOSTICS deleted_rate_limit_violations = ROW_COUNT;

  -- Clean up performance metrics
  DELETE FROM performance_metrics WHERE recorded_at < cutoff_date;
  GET DIAGNOSTICS deleted_performance_metrics = ROW_COUNT;

  -- Return results
  RETURN QUERY VALUES
    ('error_logs', deleted_error_logs),
    ('api_metrics', deleted_api_metrics),
    ('health_checks', deleted_health_checks),
    ('rate_limit_violations', deleted_rate_limit_violations),
    ('performance_metrics', deleted_performance_metrics);
END;
$$;

-- Row Level Security
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_incidents ENABLE ROW LEVEL SECURITY;

-- Allow service role to access all logging tables
CREATE POLICY "Service role can manage error logs" ON error_logs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage api metrics" ON api_metrics
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage security incidents" ON security_incidents
  FOR ALL USING (auth.role() = 'service_role');

-- Allow users to see their own error logs and metrics
CREATE POLICY "Users can view their own error logs" ON error_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own api metrics" ON api_metrics
  FOR SELECT USING (auth.uid() = user_id);

-- Insert initial health check entry
INSERT INTO health_checks (service_name, status, response_time_ms, details)
VALUES ('database', 'healthy', 0, '{"initialized": true}')
ON CONFLICT DO NOTHING;