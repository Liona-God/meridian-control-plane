/**
 * Stable contracts shared by the API, worker, and console.
 * The contracts deliberately contain no transport or storage concerns.
 */

export const roles = ["owner", "editor", "viewer"] as const;
export type Role = (typeof roles)[number];

export const workflowStatuses = ["draft", "active", "archived"] as const;
export type WorkflowStatus = (typeof workflowStatuses)[number];

export const runStatuses = [
  "queued",
  "running",
  "waiting_approval",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type RunStatus = (typeof runStatuses)[number];

export const stepKinds = ["http", "approval", "delay"] as const;
export type StepKind = (typeof stepKinds)[number];

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  displayName: string;
  role: Role;
  createdAt: string;
}

export interface WorkflowStepDefinition {
  id: string;
  name: string;
  kind: StepKind;
  timeoutSeconds: number;
  config: Record<string, unknown>;
}

export interface WorkflowDefinition {
  name: string;
  description: string;
  steps: WorkflowStepDefinition[];
}

export interface Workflow {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  version: number;
  definition: WorkflowDefinition;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRun {
  id: string;
  workspaceId: string;
  workflowId: string;
  workflowVersion: number;
  status: RunStatus;
  triggerKey: string;
  input: Record<string, unknown>;
  currentStepIndex: number;
  output: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  workspaceId: string;
  actorId: string;
  entityType: "workspace" | "workflow" | "workflow_run";
  entityId: string;
  action: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface OutboxEvent {
  id: string;
  workspaceId: string;
  topic: "workflow.run.queued" | "workflow.run.approved" | "workflow.run.completed";
  aggregateId: string;
  payload: Record<string, unknown>;
  availableAt: string;
  attempts: number;
  createdAt: string;
}

export interface WorkflowRunView {
  run: WorkflowRun;
  workflow: Pick<Workflow, "id" | "name" | "version" | "definition">;
  audit: AuditEvent[];
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

export function isRole(value: string): value is Role {
  return roles.includes(value as Role);
}

export function isWorkflowStatus(value: string): value is WorkflowStatus {
  return workflowStatuses.includes(value as WorkflowStatus);
}

export function isRunStatus(value: string): value is RunStatus {
  return runStatuses.includes(value as RunStatus);
}

export function isStepKind(value: string): value is StepKind {
  return stepKinds.includes(value as StepKind);
}
