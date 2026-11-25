-- LaporAman — skema PostgreSQL
-- Jalankan file ini sekali di SQL editor database kamu (Supabase / Neon / Render Postgres).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_hash   TEXT UNIQUE NOT NULL,
  ticket_hint   TEXT NOT NULL,
  kategori      TEXT NOT NULL,
  lokasi        TEXT NOT NULL,
  waktu         TEXT NOT NULL,
  urgensi       TEXT NOT NULL,
  kronologi     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'menunggu'
                CHECK (status IN ('menunggu', 'diverifikasi', 'prioritas', 'diteruskan', 'ditutup')),
  prioritas     TEXT NOT NULL DEFAULT 'sedang'
                CHECK (prioritas IN ('rendah', 'sedang', 'tinggi')),
  public_note   TEXT NOT NULL DEFAULT '',
  admin_note    TEXT NOT NULL DEFAULT '',
  evidence      BYTEA,
  evidence_type TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  label      TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);
CREATE INDEX IF NOT EXISTS idx_events_report_id ON events (report_id, created_at);
