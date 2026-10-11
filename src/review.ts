import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { isCivilDate, saoPauloDate, systemClock, type Clock } from './clock.js';

export type Status = 'in_review' | 'changes_requested' | 'approved';
export interface Script {
  id: string;
  status: Status;
  current_version_id: string;
  created_at: string;
  approved_at: string | null;
}
export interface Version {
  id: string;
  script_id: string;
  number: number;
  content: string;
  previous_version_id: string | null;
  created_at: string;
}
export interface RevisionRequest {
  id: string;
  script_id: string;
  version_id: string;
  reason: string;
  deadline_date: string;
  requested_at: string;
  fulfilled_by_version_id: string | null;
}
export type EventType = 'script_created' | 'changes_requested' | 'version_submitted' | 'approved';
interface EventRow {
  sequence: number;
  id: string;
  script_id: string;
  type: EventType;
  occurred_at: string;
  data: string;
}
export interface ScriptView extends Script {
  current_version: Version;
  versions: Version[];
  revision_requests: RevisionRequest[];
  history: Array<Omit<EventRow, 'data'> & { data: Record<string, unknown> }>;
}

export class ReviewError extends Error {
  constructor(public readonly status: 400 | 404 | 409, public readonly code: string, message: string) {
    super(message);
  }
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ReviewError(400, 'INVALID_INPUT', `${field} deve ser um texto não vazio.`);
  }
  return value;
}

export class ReviewService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly clock: Clock = systemClock,
    private readonly newId: () => string = randomUUID,
  ) {}

  private transaction<T>(operation: () => T, readOnly = false): T {
    this.db.exec(readOnly ? 'BEGIN' : 'BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private script(id: string): Script {
    const row = this.db.prepare('SELECT * FROM scripts WHERE id = ?').get(id) as unknown as Script | undefined;
    if (!row) throw new ReviewError(404, 'SCRIPT_NOT_FOUND', 'Roteiro não encontrado.');
    return row;
  }

  private version(id: string): Version {
    return this.db.prepare('SELECT * FROM versions WHERE id = ?').get(id) as unknown as Version;
  }

  private requireReview(script: Script): void {
    if (script.status !== 'in_review') {
      throw new ReviewError(409, 'INVALID_STATE', `A operação exige in_review; estado atual: ${script.status}.`);
    }
  }

  private checkDeadline(deadline: string, now: Date): void {
    if (deadline < saoPauloDate(now)) {
      throw new ReviewError(409, 'DEADLINE_PASSED', 'O prazo terminou em America/Sao_Paulo.');
    }
  }

  private event(scriptId: string, type: EventType, at: string, data: Record<string, unknown>): void {
    this.db.prepare(`INSERT INTO review_events (id, script_id, type, occurred_at, data)
      VALUES (?, ?, ?, ?, ?)`).run(this.newId(), scriptId, type, at, JSON.stringify(data));
  }

  create(content: unknown): { script: Script; version: Version } {
    const text = requiredText(content, 'content');
    return this.transaction(() => {
      const id = this.newId();
      const versionId = this.newId();
      const at = this.clock.now().toISOString();
      this.db.prepare(`INSERT INTO scripts (id, status, current_version_id, created_at)
        VALUES (?, 'in_review', ?, ?)`).run(id, versionId, at);
      this.db.prepare(`INSERT INTO versions (id, script_id, number, content, created_at)
        VALUES (?, ?, 1, ?, ?)`).run(versionId, id, text, at);
      this.event(id, 'script_created', at, { version_id: versionId });
      return { script: this.script(id), version: this.version(versionId) };
    });
  }

  get(id: string): ScriptView {
    return this.transaction(() => {
      const script = this.script(id);
      const versions = this.db.prepare('SELECT * FROM versions WHERE script_id = ? ORDER BY number')
        .all(id) as unknown as Version[];
      const requests = this.db.prepare(`SELECT r.* FROM revision_requests r
        JOIN versions v ON v.id = r.version_id WHERE r.script_id = ? ORDER BY v.number`)
        .all(id) as unknown as RevisionRequest[];
      const events = this.db.prepare('SELECT * FROM review_events WHERE script_id = ? ORDER BY sequence')
        .all(id) as unknown as EventRow[];
      return {
        ...script,
        current_version: this.version(script.current_version_id),
        versions,
        revision_requests: requests,
        history: events.map((event) => ({ ...event, data: JSON.parse(event.data) as Record<string, unknown> })),
      };
    }, true);
  }

  requestChanges(id: string, reason: unknown, deadline: unknown): RevisionRequest {
    const text = requiredText(reason, 'reason');
    if (!isCivilDate(deadline)) {
      throw new ReviewError(400, 'INVALID_INPUT', 'deadline_date deve ser uma data civil válida em YYYY-MM-DD.');
    }
    return this.transaction(() => {
      const script = this.script(id);
      this.requireReview(script);
      const now = this.clock.now();
      this.checkDeadline(deadline, now);
      const requestId = this.newId();
      const at = now.toISOString();
      this.db.prepare(`INSERT INTO revision_requests
        (id, script_id, version_id, reason, deadline_date, requested_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(requestId, id, script.current_version_id, text, deadline, at);
      this.db.prepare("UPDATE scripts SET status = 'changes_requested' WHERE id = ?").run(id);
      this.event(id, 'changes_requested', at, { request_id: requestId, version_id: script.current_version_id });
      return this.db.prepare('SELECT * FROM revision_requests WHERE id = ?').get(requestId) as unknown as RevisionRequest;
    });
  }

  submitVersion(id: string, content: unknown): { script: Script; version: Version } {
    const text = requiredText(content, 'content');
    return this.transaction(() => {
      const script = this.script(id);
      if (script.status !== 'changes_requested') {
        throw new ReviewError(409, 'INVALID_STATE', `O reenvio exige changes_requested; estado atual: ${script.status}.`);
      }
      const request = this.db.prepare(`SELECT * FROM revision_requests
        WHERE script_id = ? AND fulfilled_by_version_id IS NULL`).get(id) as unknown as RevisionRequest;
      const now = this.clock.now();
      this.checkDeadline(request.deadline_date, now);
      const versionId = this.newId();
      const previous = this.version(script.current_version_id);
      const at = now.toISOString();
      this.db.prepare(`INSERT INTO versions
        (id, script_id, number, content, previous_version_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(versionId, id, previous.number + 1, text, previous.id, at);
      this.db.prepare('UPDATE revision_requests SET fulfilled_by_version_id = ? WHERE id = ?')
        .run(versionId, request.id);
      this.db.prepare("UPDATE scripts SET status = 'in_review', current_version_id = ? WHERE id = ?")
        .run(versionId, id);
      this.event(id, 'version_submitted', at, {
        version_id: versionId, previous_version_id: previous.id, request_id: request.id,
      });
      return { script: this.script(id), version: this.version(versionId) };
    });
  }

  approve(id: string) {
    return this.transaction(() => {
      const script = this.script(id);
      if (script.status !== 'approved') {
        this.requireReview(script);
        const at = this.clock.now().toISOString();
        this.db.prepare("UPDATE scripts SET status = 'approved', approved_at = ? WHERE id = ?").run(at, id);
        this.event(id, 'approved', at, { version_id: script.current_version_id });
      }
      const approved = this.script(id);
      return {
        script_id: id,
        status: approved.status,
        approved_version_id: approved.current_version_id,
        approved_at: approved.approved_at,
      };
    });
  }
}
