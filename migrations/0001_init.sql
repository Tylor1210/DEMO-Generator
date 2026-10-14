-- Runs, one per submitted website. Stage files live in R2 under runs/<id>/stages/.
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL,            -- running | done | failed | blocked | review | queued
  stage TEXT,                      -- current or last stage
  message TEXT,
  slug TEXT,
  email TEXT,
  owner_claim INTEGER NOT NULL DEFAULT 0,
  preset INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,     -- unix ms
  expires_at INTEGER,
  tokens INTEGER NOT NULL DEFAULT 0,
  cost_estimate REAL NOT NULL DEFAULT 0
);
CREATE INDEX runs_domain ON runs(domain, created_at);
CREATE INDEX runs_slug ON runs(slug);
CREATE INDEX runs_created ON runs(created_at);

-- Successful stage durations, for the progress bar's ETA (rolling median of the last 50).
CREATE TABLE stage_timings (
  stage TEXT NOT NULL,
  ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX stage_timings_stage ON stage_timings(stage, created_at);

CREATE TABLE leads (
  email TEXT NOT NULL,
  run_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  owner_claim INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX leads_created ON leads(created_at);

CREATE TABLE events (
  slug TEXT NOT NULL,
  session TEXT,
  name TEXT NOT NULL,
  props_json TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX events_slug ON events(slug, name);

CREATE TABLE reports (
  slug TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);
