import { randomUUID } from "node:crypto";
import type {
  AuditEvent,
  OutboxEvent,
  Role,
  Workflow,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowRunView,
  Workspace,
  WorkspaceMember,
} from "@meridian/contracts";
import { DomainError } from "./errors.js";
import type { ControlPlaneStore } from "./store.js";

export interface Actor {
  userId: string;
  displayName: string;
}

export interface StepExecutor {
  execute(input: {
    run: WorkflowRun;
    workflow: Workflow;
    step: WorkflowDefinition["steps"][number];
  }): Promise<Record<string, unknown>>;
}

export interface Clock {
  now(): Date;
}

const systemClock: Clock = { now: () => new Date() };

function timestamp(clock: Clock): string {
  return clock.now().toISOString();
}

function requireText(value: string, label: string, limit: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > limit) {
    throw new DomainError("validation", label + " must be between 1 and " + limit + " characters");
  }
  return normalized;
}

function validateDefinition(definition: WorkflowDefinition): WorkflowDefinition {
  const name = requireText(definition.name, "Workflow name", 120);
  if (definition.description.length > 2_000) {
    throw new DomainError("validation", "Workflow description must be at most 2000 characters");
  }
  if (definition.steps.length === 0 || definition.steps.length > 50) {
    throw new DomainError("validation", "Workflow must contain between 1 and 50 steps");
  }
  const identifiers = new Set<string>();
  for (const step of definition.steps) {
    requireText(step.id, "Step id", 80);
    requireText(step.name, "Step name", 160);
    if (identifiers.has(step.id)) {
      throw new DomainError("validation", "Workflow step ids must be unique");
    }
    identifiers.add(step.id);
    if (!Number.isInteger(step.timeoutSeconds) || step.timeoutSeconds < 1 || step.timeoutSeconds > 3_600) {
      throw new DomainError("validation", "Step timeoutSeconds must be between 1 and 3600");
    }
  }
  return structuredClone({ ...definition, name });
}

function rank(role: Role): number {
  return role === "owner" ? 3 : role === "editor" ? 2 : 1;
}

export class ControlPlaneService {
  public constructor(
    private readonly store: ControlPlaneStore,
    private readonly clock: Clock = systemClock,
  ) {}

  public createWorkspace(input: { slug: string; name: string }, actor: Actor): Workspace {
    const slug = input.slug.trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{2,47}$/.test(slug)) {
      throw new DomainError(
        "validation",
        "Workspace slug must contain 3-48 lowercase letters, digits, or hyphens",
      );
    }
    if (this.store.findWorkspaceBySlug(slug)) {
      throw new DomainError("conflict", "Workspace slug is already in use");
    }
    const now = timestamp(this.clock);
    const workspace: Workspace = {
      id: randomUUID(),
      slug,
      name: requireText(input.name, "Workspace name", 120),
      createdAt: now,
    };
    this.store.createWorkspace(workspace);
    this.store.addMember({
      workspaceId: workspace.id,
      userId: actor.userId,
      displayName: actor.displayName,
      role: "owner",
      createdAt: now,
    });
    this.audit(workspace.id, actor.userId, "workspace", workspace.id, "workspace.created", {
      slug,
    });
    return workspace;
  }

  public addMember(
    workspaceId: string,
    input: { userId: string; displayName: string; role: Role },
    actor: Actor,
  ): WorkspaceMember {
    this.requireWorkspace(workspaceId);
    this.requireRole(workspaceId, actor, "owner");
    const member: WorkspaceMember = {
      workspaceId,
      userId: requireText(input.userId, "Member userId", 120),
      displayName: requireText(input.displayName, "Member displayName", 120),
      role: input.role,
      createdAt: timestamp(this.clock),
    };
    this.store.addMember(member);
    this.audit(workspaceId, actor.userId, "workspace", workspaceId, "member.upserted", {
      userId: member.userId,
      role: member.role,
    });
    return member;
  }

  public listWorkflows(workspaceId: string, actor: Actor): Workflow[] {
    this.requireWorkspace(workspaceId);
    this.requireRole(workspaceId, actor, "viewer");
    return this.store.listWorkflows(workspaceId);
  }

  public createWorkflow(
    workspaceId: string,
    definition: WorkflowDefinition,
    actor: Actor,
  ): Workflow {
    this.requireWorkspace(workspaceId);
    this.requireRole(workspaceId, actor, "editor");
    const normalizedDefinition = validateDefinition(definition);
    const now = timestamp(this.clock);
    const workflow: Workflow = {
      id: randomUUID(),
      workspaceId,
      name: normalizedDefinition.name,
      description: normalizedDefinition.description.trim(),
      status: "draft",
      version: 1,
      definition: normalizedDefinition,
      createdBy: actor.userId,
      createdAt: now,
      updatedAt: now,
    };
    this.store.createWorkflow(workflow);
    this.audit(workspaceId, actor.userId, "workflow", workflow.id, "workflow.created", {
      version: workflow.version,
    });
    return workflow;
  }

  public activateWorkflow(workspaceId: string, workflowId: string, actor: Actor): Workflow {
    this.requireRole(workspaceId, actor, "editor");
    const workflow = this.requireWorkflow(workspaceId, workflowId);
    if (workflow.status === "archived") {
      throw new DomainError("invalid_state", "Archived workflows cannot be activated");
    }
    if (workflow.status === "active") {
      return workflow;
    }
    const updated: Workflow = {
      ...workflow,
      status: "active",
      updatedAt: timestamp(this.clock),
    };
    this.store.saveWorkflow(updated);
    this.audit(workspaceId, actor.userId, "workflow", workflowId, "workflow.activated", {
      version: updated.version,
    });
    return updated;
  }

  public triggerRun(
    workspaceId: string,
    workflowId: string,
    input: Record<string, unknown>,
    triggerKey: string,
    actor: Actor,
  ): { run: WorkflowRun; created: boolean } {
    this.requireRole(workspaceId, actor, "editor");
    const workflow = this.requireWorkflow(workspaceId, workflowId);
    if (workflow.status !== "active") {
      throw new DomainError("invalid_state", "Only active workflows can be triggered");
    }
    const key = requireText(triggerKey, "Idempotency key", 200);
    const existing = this.store.findRunByTriggerKey(workspaceId, workflowId, key);
    if (existing) {
      return { run: existing, created: false };
    }
    const now = timestamp(this.clock);
    const run: WorkflowRun = {
      id: randomUUID(),
      workspaceId,
      workflowId,
      workflowVersion: workflow.version,
      status: "queued",
      triggerKey: key,
      input: structuredClone(input),
      currentStepIndex: 0,
      output: {},
      createdBy: actor.userId,
      createdAt: now,
      updatedAt: now,
    };
    this.store.createRun(run);
    this.audit(workspaceId, actor.userId, "workflow_run", run.id, "workflow_run.queued", {
      workflowId,
      triggerKey: key,
    });
    this.outbox(workspaceId, "workflow.run.queued", run.id, { workflowId, runId: run.id });
    return { run, created: true };
  }

  public getRun(workspaceId: string, runId: string, actor: Actor): WorkflowRunView {
    this.requireRole(workspaceId, actor, "viewer");
    const run = this.requireRun(workspaceId, runId);
    const workflow = this.requireWorkflow(workspaceId, run.workflowId);
    return {
      run,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        version: workflow.version,
        definition: workflow.definition,
      },
      audit: this.store.listAudit(workspaceId, runId),
    };
  }

  public listRuns(workspaceId: string, actor: Actor): WorkflowRun[] {
    this.requireRole(workspaceId, actor, "viewer");
    return this.store.listRuns(workspaceId);
  }

  public approveRun(workspaceId: string, runId: string, actor: Actor): WorkflowRun {
    this.requireRole(workspaceId, actor, "owner");
    const run = this.requireRun(workspaceId, runId);
    if (run.status !== "waiting_approval") {
      throw new DomainError("invalid_state", "Only runs waiting for approval can be approved");
    }
    const updated: WorkflowRun = {
      ...run,
      status: "queued",
      currentStepIndex: run.currentStepIndex + 1,
      updatedAt: timestamp(this.clock),
    };
    this.store.saveRun(updated);
    this.audit(workspaceId, actor.userId, "workflow_run", runId, "workflow_run.approved", {});
    this.outbox(workspaceId, "workflow.run.approved", runId, {});
    return updated;
  }

  public cancelRun(workspaceId: string, runId: string, actor: Actor): WorkflowRun {
    this.requireRole(workspaceId, actor, "editor");
    const run = this.requireRun(workspaceId, runId);
    if (["succeeded", "failed", "cancelled"].includes(run.status)) {
      throw new DomainError("invalid_state", "Terminal runs cannot be cancelled");
    }
    const updated: WorkflowRun = {
      ...run,
      status: "cancelled",
      updatedAt: timestamp(this.clock),
    };
    this.store.saveRun(updated);
    this.audit(workspaceId, actor.userId, "workflow_run", runId, "workflow_run.cancelled", {});
    return updated;
  }

  public async processRunnableRuns(executor: StepExecutor, limit = 25): Promise<WorkflowRun[]> {
    const results: WorkflowRun[] = [];
    for (const run of this.store.listRunnableRuns(Math.min(Math.max(limit, 1), 100))) {
      results.push(await this.processOneStep(run, executor));
    }
    return results;
  }

  private async processOneStep(run: WorkflowRun, executor: StepExecutor): Promise<WorkflowRun> {
    const workflow = this.requireWorkflow(run.workspaceId, run.workflowId);
    const now = timestamp(this.clock);
    const step = workflow.definition.steps[run.currentStepIndex];
    if (!step) {
      return this.complete(run, now);
    }
    if (step.kind === "approval") {
      const waiting: WorkflowRun = {
        ...run,
        status: "waiting_approval",
        updatedAt: now,
      };
      this.store.saveRun(waiting);
      this.audit(run.workspaceId, "system", "workflow_run", run.id, "workflow_run.waiting_approval", {
        stepId: step.id,
      });
      return waiting;
    }
    try {
      const result = await executor.execute({ run, workflow, step });
      const next: WorkflowRun = {
        ...run,
        status: "running",
        currentStepIndex: run.currentStepIndex + 1,
        output: { ...run.output, [step.id]: result },
        updatedAt: timestamp(this.clock),
      };
      this.store.saveRun(next);
      this.audit(run.workspaceId, "system", "workflow_run", run.id, "workflow_run.step_succeeded", {
        stepId: step.id,
      });
      return next.currentStepIndex >= workflow.definition.steps.length
        ? this.complete(next, timestamp(this.clock))
        : next;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown step execution failure";
      const failed: WorkflowRun = {
        ...run,
        status: "failed",
        output: { ...run.output, failure: { stepId: step.id, message } },
        updatedAt: timestamp(this.clock),
      };
      this.store.saveRun(failed);
      this.audit(run.workspaceId, "system", "workflow_run", run.id, "workflow_run.failed", {
        stepId: step.id,
      });
      this.outbox(run.workspaceId, "workflow.run.completed", run.id, { status: "failed" });
      return failed;
    }
  }

  private complete(run: WorkflowRun, now: string): WorkflowRun {
    const completed: WorkflowRun = {
      ...run,
      status: "succeeded",
      updatedAt: now,
    };
    this.store.saveRun(completed);
    this.audit(run.workspaceId, "system", "workflow_run", run.id, "workflow_run.succeeded", {});
    this.outbox(run.workspaceId, "workflow.run.completed", run.id, { status: "succeeded" });
    return completed;
  }

  private requireWorkspace(workspaceId: string): Workspace {
    const workspace = this.store.getWorkspace(workspaceId);
    if (!workspace) {
      throw new DomainError("not_found", "Workspace was not found");
    }
    return workspace;
  }

  private requireWorkflow(workspaceId: string, workflowId: string): Workflow {
    const workflow = this.store.getWorkflow(workspaceId, workflowId);
    if (!workflow) {
      throw new DomainError("not_found", "Workflow was not found");
    }
    return workflow;
  }

  private requireRun(workspaceId: string, runId: string): WorkflowRun {
    const run = this.store.getRun(workspaceId, runId);
    if (!run) {
      throw new DomainError("not_found", "Workflow run was not found");
    }
    return run;
  }

  private requireRole(workspaceId: string, actor: Actor, minimumRole: Role): WorkspaceMember {
    this.requireWorkspace(workspaceId);
    const member = this.store.getMember(workspaceId, actor.userId);
    if (!member || rank(member.role) < rank(minimumRole)) {
      throw new DomainError("forbidden", "Actor does not have sufficient workspace permission");
    }
    return member;
  }

  private audit(
    workspaceId: string,
    actorId: string,
    entityType: AuditEvent["entityType"],
    entityId: string,
    action: string,
    metadata: Record<string, unknown>,
  ): void {
    this.store.appendAudit({
      id: randomUUID(),
      workspaceId,
      actorId,
      entityType,
      entityId,
      action,
      metadata,
      occurredAt: timestamp(this.clock),
    });
  }

  private outbox(
    workspaceId: string,
    topic: OutboxEvent["topic"],
    aggregateId: string,
    payload: Record<string, unknown>,
  ): void {
    const now = timestamp(this.clock);
    this.store.enqueueOutbox({
      id: randomUUID(),
      workspaceId,
      topic,
      aggregateId,
      payload,
      availableAt: now,
      attempts: 0,
      createdAt: now,
    });
  }
}

/**
 * Predictable executor for local development. HTTP-like steps can ask for
 * simulateFailure in their config, which exercises the full terminal failure
 * path without making outbound calls.
 */
export class DeterministicStepExecutor implements StepExecutor {
  public async execute(input: {
    run: WorkflowRun;
    workflow: Workflow;
    step: WorkflowDefinition["steps"][number];
  }): Promise<Record<string, unknown>> {
    if (input.step.config.simulateFailure === true) {
      throw new Error("Step requested a deterministic failure");
    }
    return {
      kind: input.step.kind,
      stepId: input.step.id,
      runId: input.run.id,
      workflowVersion: input.workflow.version,
    };
  }
}
