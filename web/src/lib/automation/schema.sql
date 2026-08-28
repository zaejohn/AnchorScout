-- Explicit setup migration: never run DDL during cron requests.
CREATE TABLE IF NOT EXISTS anchorscout_simulation_profiles (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  feedback text,
  reserved_run_id uuid UNIQUE,
  reserved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((reserved_run_id IS NULL) = (reserved_at IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS anchorscout_simulation_profiles_email_lower
  ON anchorscout_simulation_profiles (lower(email));

CREATE TABLE IF NOT EXISTS anchorscout_simulation_runs (
  id uuid PRIMARY KEY,
  profile_id text NOT NULL UNIQUE REFERENCES anchorscout_simulation_profiles(id),
  wallet text NOT NULL UNIQUE,
  state text NOT NULL CHECK (state IN ('CREATED', 'FUNDED', 'SWAPPED', 'ROUTES_COMPARED', 'ROUTE_SELECTED', 'PROOF_SIGNED', 'COMPLETED', 'FORM_SUBMITTED')),
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS anchorscout_simulation_control (
  id integer PRIMARY KEY CHECK (id = 1),
  last_run_at timestamptz,
  next_run_at timestamptz,
  active_run_id uuid REFERENCES anchorscout_simulation_runs(id),
  lease_token uuid,
  lease_until timestamptz,
  CHECK ((lease_token IS NULL) = (lease_until IS NULL)),
  CHECK (active_run_id IS NOT NULL OR lease_token IS NULL)
);

INSERT INTO anchorscout_simulation_control(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS anchorscout_provider_quote_limits (
  subject_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (subject_hash, window_start)
);
