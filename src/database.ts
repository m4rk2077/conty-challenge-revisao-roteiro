import { DatabaseSync } from 'node:sqlite';

export function openDatabase(path = ':memory:'): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS scripts (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('in_review', 'changes_requested', 'approved')),
      current_version_id TEXT NOT NULL REFERENCES versions(id) DEFERRABLE INITIALLY DEFERRED,
      created_at TEXT NOT NULL,
      approved_at TEXT,
      CHECK ((status = 'approved') = (approved_at IS NOT NULL))
    ) STRICT;

    CREATE TABLE IF NOT EXISTS versions (
      id TEXT PRIMARY KEY,
      script_id TEXT NOT NULL REFERENCES scripts(id),
      number INTEGER NOT NULL CHECK (number > 0),
      content TEXT NOT NULL,
      previous_version_id TEXT REFERENCES versions(id),
      created_at TEXT NOT NULL,
      UNIQUE (script_id, number)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS revision_requests (
      id TEXT PRIMARY KEY,
      script_id TEXT NOT NULL REFERENCES scripts(id),
      version_id TEXT NOT NULL REFERENCES versions(id),
      reason TEXT NOT NULL,
      deadline_date TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      fulfilled_by_version_id TEXT REFERENCES versions(id)
    ) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS one_open_request
      ON revision_requests(script_id) WHERE fulfilled_by_version_id IS NULL;

    CREATE TABLE IF NOT EXISTS review_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      script_id TEXT NOT NULL REFERENCES scripts(id),
      type TEXT NOT NULL CHECK (type IN ('script_created', 'changes_requested', 'version_submitted', 'approved')),
      occurred_at TEXT NOT NULL,
      data TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS events_by_script ON review_events(script_id, sequence);
    CREATE INDEX IF NOT EXISTS requests_by_script ON revision_requests(script_id);
  `);
  return db;
}
