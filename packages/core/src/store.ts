import type {
  AuditEvent,
  OutboxEvent,
  Workflow,
  WorkflowRun,
  Workspace,
  WorkspaceMember,
} from "@meridian/contracts";

export interface ControlPlaneStore {
  createWorkspace(workspace: Workspace): void;
  getWorkspace(workspaceId: string): Workspace | undefined;
  findWorkspaceBySlug(slug: string): Workspace | undefined;
  addMember(member: WorkspaceMember): void;
  getMember(workspaceId: string, userId: string): WorkspaceMember | undefined;
  listMembers(workspaceId: string): WorkspaceMember[];
  createWorkflow(workflow: Workflow): void;
  getWorkflow(workspaceId: string, workflowId: string): Workflow | undefined;
  listWorkflows(workspaceId: string): Workflow[];
  saveWorkflow(workflow: Workflow): void;
  createRun(run: WorkflowRun): void;
  getRun(workspaceId: string, runId: string): WorkflowRun | undefined;
  findRunByTriggerKey(
    workspaceId: string,
    workflowId: string,
    triggerKey: string,
  ): WorkflowRun | undefined;
  listRuns(workspaceId: string): WorkflowRun[];
  listRunnableRuns(limit: number): WorkflowRun[];
  saveRun(run: WorkflowRun): void;
  appendAudit(event: AuditEvent): void;
  listAudit(workspaceId: string, entityId?: string): AuditEvent[];
  enqueueOutbox(event: OutboxEvent): void;
  listOutbox(workspaceId: string): OutboxEvent[];
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

/**
 * A deterministic in-memory adapter used by unit tests and local quickstarts.
 * Its port matches the PostgreSQL schema so API semantics do not depend on the
 * persistence implementation.
 */
export class InMemoryControlPlaneStore implements ControlPlaneStore {
  private readonly workspaces = new Map<string, Workspace>();
  private readonly members = new Map<string, WorkspaceMember>();
  private readonly workflows = new Map<string, Workflow>();
  private readonly runs = new Map<string, WorkflowRun>();
  private readonly audit: AuditEvent[] = [];
  private readonly outbox: OutboxEvent[] = [];

  public createWorkspace(workspace: Workspace): void {
    this.workspaces.set(workspace.id, copy(workspace));
  }

  public getWorkspace(workspaceId: string): Workspace | undefined {
    const workspace = this.workspaces.get(workspaceId);
    return workspace ? copy(workspace) : undefined;
  }

  public findWorkspaceBySlug(slug: string): Workspace | undefined {
    const workspace = [...this.workspaces.values()].find((candidate) => candidate.slug === slug);
    return workspace ? copy(workspace) : undefined;
  }

  public addMember(member: WorkspaceMember): void {
    this.members.set(member.workspaceId + ":" + member.userId, copy(member));
  }

  public getMember(workspaceId: string, userId: string): WorkspaceMember | undefined {
    const member = this.members.get(workspaceId + ":" + userId);
    return member ? copy(member) : undefined;
  }

  public listMembers(workspaceId: string): WorkspaceMember[] {
    return [...this.members.values()]
      .filter((member) => member.workspaceId === workspaceId)
      .map(copy);
  }

  public createWorkflow(workflow: Workflow): void {
    this.workflows.set(workflow.id, copy(workflow));
  }

  public getWorkflow(workspaceId: string, workflowId: string): Workflow | undefined {
    const workflow = this.workflows.get(workflowId);
    return workflow?.workspaceId === workspaceId ? copy(workflow) : undefined;
  }

  public listWorkflows(workspaceId: string): Workflow[] {
    return [...this.workflows.values()]
      .filter((workflow) => workflow.workspaceId === workspaceId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(copy);
  }

  public saveWorkflow(workflow: Workflow): void {
    this.workflows.set(workflow.id, copy(workflow));
  }

  public createRun(run: WorkflowRun): void {
    this.runs.set(run.id, copy(run));
  }

  public getRun(workspaceId: string, runId: string): WorkflowRun | undefined {
    const run = this.runs.get(runId);
    return run?.workspaceId === workspaceId ? copy(run) : undefined;
  }

  public findRunByTriggerKey(
    workspaceId: string,
    workflowId: string,
    triggerKey: string,
  ): WorkflowRun | undefined {
    const run = [...this.runs.values()].find(
      (candidate) =>
        candidate.workspaceId === workspaceId &&
        candidate.workflowId === workflowId &&
        candidate.triggerKey === triggerKey,
    );
    return run ? copy(run) : undefined;
  }

  public listRuns(workspaceId: string): WorkflowRun[] {
    return [...this.runs.values()]
      .filter((run) => run.workspaceId === workspaceId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(copy);
  }

  public listRunnableRuns(limit: number): WorkflowRun[] {
    return [...this.runs.values()]
      .filter((run) => run.status === "queued" || run.status === "running")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, limit)
      .map(copy);
  }

  public saveRun(run: WorkflowRun): void {
    this.runs.set(run.id, copy(run));
  }

  public appendAudit(event: AuditEvent): void {
    this.audit.push(copy(event));
  }

  public listAudit(workspaceId: string, entityId?: string): AuditEvent[] {
    return this.audit
      .filter(
        (event) =>
          event.workspaceId === workspaceId && (entityId === undefined || event.entityId === entityId),
      )
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      .map(copy);
  }

  public enqueueOutbox(event: OutboxEvent): void {
    this.outbox.push(copy(event));
  }

  public listOutbox(workspaceId: string): OutboxEvent[] {
    return this.outbox
      .filter((event) => event.workspaceId === workspaceId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(copy);
  }
}
