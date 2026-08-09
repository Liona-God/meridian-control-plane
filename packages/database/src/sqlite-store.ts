import { DatabaseSync } from "node:sqlite";
import type {
  AuditEvent,
  OutboxEvent,
  Workflow,
  WorkflowRun,
  Workspace,
  WorkspaceMember,
} from "@meridian/contracts";
import type { ControlPlaneStore } from "@meridian/core";

interface JsonRow {
  payload: string;
}

const schema = [
  "PRAGMA journal_mode = WAL;",
  "PRAGMA foreign_keys = ON;",
  "CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, payload TEXT NOT NULL);",
  "CREATE TABLE IF NOT EXISTS members (workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(workspace_id, user_id));",
  "CREATE TABLE IF NOT EXISTS workflows (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, updated_at TEXT NOT NULL, payload TEXT NOT NULL);",
  "CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, workflow_id TEXT NOT NULL, trigger_key TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(workspace_id, workflow_id, trigger_key));",
  "CREATE INDEX IF NOT EXISTS runs_runnable_idx ON runs(status, created_at);",
  "CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, entity_id TEXT NOT NULL, occurred_at TEXT NOT NULL, payload TEXT NOT NULL);",
  "CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_events(workspace_id, entity_id, occurred_at);",
  "CREATE TABLE IF NOT EXISTS outbox_events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL);",
].join("\n");

function parse<T>(row: JsonRow | undefined): T | undefined {
  return row ? (JSON.parse(row.payload) as T) : undefined;
}

function parseMany<T>(rows: JsonRow[]): T[] {
  return rows.map((row) => JSON.parse(row.payload) as T);
}

/**
 * Durable local adapter. It mirrors the aggregate-oriented store port with
 * synchronous SQLite transactions, which is ideal for a single-node developer
 * stack while the PostgreSQL migration documents the production data model.
 */
export class SqliteControlPlaneStore implements ControlPlaneStore {
  private readonly database: DatabaseSync;

  public constructor(databasePath = "./meridian.db") {
    this.database = new DatabaseSync(databasePath);
    this.database.exec(schema);
  }

  public close(): void {
    this.database.close();
  }

  public createWorkspace(workspace: Workspace): void {
    this.database
      .prepare("INSERT INTO workspaces(id, slug, payload) VALUES (?, ?, ?)")
      .run(workspace.id, workspace.slug, JSON.stringify(workspace));
  }

  public getWorkspace(workspaceId: string): Workspace | undefined {
    return parse<Workspace>(
      this.database.prepare("SELECT payload FROM workspaces WHERE id = ?").get(workspaceId) as JsonRow | undefined,
    );
  }

  public findWorkspaceBySlug(slug: string): Workspace | undefined {
    return parse<Workspace>(
      this.database.prepare("SELECT payload FROM workspaces WHERE slug = ?").get(slug) as JsonRow | undefined,
    );
  }

  public addMember(member: WorkspaceMember): void {
    this.database
      .prepare(
        "INSERT INTO members(workspace_id, user_id, payload) VALUES (?, ?, ?) ON CONFLICT(workspace_id, user_id) DO UPDATE SET payload = excluded.payload",
      )
      .run(member.workspaceId, member.userId, JSON.stringify(member));
  }

  public getMember(workspaceId: string, userId: string): WorkspaceMember | undefined {
    return parse<WorkspaceMember>(
      this.database
        .prepare("SELECT payload FROM members WHERE workspace_id = ? AND user_id = ?")
        .get(workspaceId, userId) as JsonRow | undefined,
    );
  }

  public listMembers(workspaceId: string): WorkspaceMember[] {
    return parseMany<WorkspaceMember>(
      this.database
        .prepare("SELECT payload FROM members WHERE workspace_id = ?")
        .all(workspaceId) as unknown as JsonRow[],
    );
  }

  public createWorkflow(workflow: Workflow): void {
    this.database
      .prepare("INSERT INTO workflows(id, workspace_id, updated_at, payload) VALUES (?, ?, ?, ?)")
      .run(workflow.id, workflow.workspaceId, workflow.updatedAt, JSON.stringify(workflow));
  }

  public getWorkflow(workspaceId: string, workflowId: string): Workflow | undefined {
    return parse<Workflow>(
      this.database
        .prepare("SELECT payload FROM workflows WHERE id = ? AND workspace_id = ?")
        .get(workflowId, workspaceId) as JsonRow | undefined,
    );
  }

  public listWorkflows(workspaceId: string): Workflow[] {
    return parseMany<Workflow>(
      this.database
        .prepare("SELECT payload FROM workflows WHERE workspace_id = ? ORDER BY updated_at DESC")
        .all(workspaceId) as unknown as JsonRow[],
    );
  }

  public saveWorkflow(workflow: Workflow): void {
    this.database
      .prepare("UPDATE workflows SET updated_at = ?, payload = ? WHERE id = ? AND workspace_id = ?")
      .run(workflow.updatedAt, JSON.stringify(workflow), workflow.id, workflow.workspaceId);
  }

  public createRun(run: WorkflowRun): void {
    this.database
      .prepare(
        "INSERT INTO runs(id, workspace_id, workflow_id, trigger_key, status, created_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        run.id,
        run.workspaceId,
        run.workflowId,
        run.triggerKey,
        run.status,
        run.createdAt,
        JSON.stringify(run),
      );
  }

  public getRun(workspaceId: string, runId: string): WorkflowRun | undefined {
    return parse<WorkflowRun>(
      this.database
        .prepare("SELECT payload FROM runs WHERE id = ? AND workspace_id = ?")
        .get(runId, workspaceId) as JsonRow | undefined,
    );
  }

  public findRunByTriggerKey(
    workspaceId: string,
    workflowId: string,
    triggerKey: string,
  ): WorkflowRun | undefined {
    return parse<WorkflowRun>(
      this.database
        .prepare(
          "SELECT payload FROM runs WHERE workspace_id = ? AND workflow_id = ? AND trigger_key = ?",
        )
        .get(workspaceId, workflowId, triggerKey) as JsonRow | undefined,
    );
  }

  public listRuns(workspaceId: string): WorkflowRun[] {
    return parseMany<WorkflowRun>(
      this.database
        .prepare("SELECT payload FROM runs WHERE workspace_id = ? ORDER BY created_at DESC")
        .all(workspaceId) as unknown as JsonRow[],
    );
  }

  public listRunnableRuns(limit: number): WorkflowRun[] {
    return parseMany<WorkflowRun>(
      this.database
        .prepare(
          "SELECT payload FROM runs WHERE status IN ('queued', 'running') ORDER BY created_at ASC LIMIT ?",
        )
        .all(limit) as unknown as JsonRow[],
    );
  }

  public saveRun(run: WorkflowRun): void {
    this.database
      .prepare("UPDATE runs SET status = ?, payload = ? WHERE id = ? AND workspace_id = ?")
      .run(run.status, JSON.stringify(run), run.id, run.workspaceId);
  }

  public appendAudit(event: AuditEvent): void {
    this.database
      .prepare(
        "INSERT INTO audit_events(id, workspace_id, entity_id, occurred_at, payload) VALUES (?, ?, ?, ?, ?)",
      )
      .run(event.id, event.workspaceId, event.entityId, event.occurredAt, JSON.stringify(event));
  }

  public listAudit(workspaceId: string, entityId?: string): AuditEvent[] {
    const rows =
      entityId === undefined
        ? this.database
            .prepare("SELECT payload FROM audit_events WHERE workspace_id = ? ORDER BY occurred_at ASC")
            .all(workspaceId)
        : this.database
            .prepare(
              "SELECT payload FROM audit_events WHERE workspace_id = ? AND entity_id = ? ORDER BY occurred_at ASC",
            )
            .all(workspaceId, entityId);
    return parseMany<AuditEvent>(rows as unknown as JsonRow[]);
  }

  public enqueueOutbox(event: OutboxEvent): void {
    this.database
      .prepare("INSERT INTO outbox_events(id, workspace_id, created_at, payload) VALUES (?, ?, ?, ?)")
      .run(event.id, event.workspaceId, event.createdAt, JSON.stringify(event));
  }

  public listOutbox(workspaceId: string): OutboxEvent[] {
    return parseMany<OutboxEvent>(
      this.database
        .prepare("SELECT payload FROM outbox_events WHERE workspace_id = ? ORDER BY created_at ASC")
        .all(workspaceId) as unknown as JsonRow[],
    );
  }
}
