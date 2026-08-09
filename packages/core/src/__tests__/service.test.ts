import assert from "node:assert/strict";
import test from "node:test";
import {
  ControlPlaneService,
  DeterministicStepExecutor,
  DomainError,
  InMemoryControlPlaneStore,
  type Actor,
} from "../index.js";

const owner: Actor = { userId: "usr_owner", displayName: "Avery Owner" };
const editor: Actor = { userId: "usr_editor", displayName: "Emery Editor" };

test("enforces tenant roles, idempotency, approval, and audited execution", async () => {
  const service = new ControlPlaneService(new InMemoryControlPlaneStore());
  const workspace = service.createWorkspace({ slug: "acme-ops", name: "Acme Operations" }, owner);
  service.addMember(
    workspace.id,
    { userId: editor.userId, displayName: editor.displayName, role: "editor" },
    owner,
  );
  const workflow = service.createWorkflow(
    workspace.id,
    {
      name: "Release train",
      description: "Gate a release behind an owner approval.",
      steps: [
        { id: "prepare", name: "Prepare release", kind: "http", timeoutSeconds: 30, config: {} },
        { id: "approval", name: "Approve release", kind: "approval", timeoutSeconds: 300, config: {} },
        { id: "deploy", name: "Deploy release", kind: "http", timeoutSeconds: 60, config: {} },
      ],
    },
    editor,
  );
  service.activateWorkflow(workspace.id, workflow.id, editor);
  const first = service.triggerRun(workspace.id, workflow.id, { release: "2026.08.9" }, "req-1", editor);
  const duplicate = service.triggerRun(workspace.id, workflow.id, { release: "ignored" }, "req-1", editor);

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(first.run.id, duplicate.run.id);

  const executor = new DeterministicStepExecutor();
  const firstTick = await service.processRunnableRuns(executor);
  assert.equal(firstTick[0]?.status, "running");
  const secondTick = await service.processRunnableRuns(executor);
  assert.equal(secondTick[0]?.status, "waiting_approval");
  assert.throws(
    () => service.approveRun(workspace.id, first.run.id, editor),
    (error: unknown) => error instanceof DomainError && error.code === "forbidden",
  );

  service.approveRun(workspace.id, first.run.id, owner);
  const thirdTick = await service.processRunnableRuns(executor);
  assert.equal(thirdTick[0]?.status, "succeeded");
  const view = service.getRun(workspace.id, first.run.id, owner);
  assert.equal(view.run.status, "succeeded");
  assert.ok(view.audit.some((event) => event.action === "workflow_run.approved"));
});

test("rejects activating or triggering invalid workflow state", () => {
  const service = new ControlPlaneService(new InMemoryControlPlaneStore());
  const workspace = service.createWorkspace({ slug: "valid-ops", name: "Valid Ops" }, owner);
  const workflow = service.createWorkflow(
    workspace.id,
    {
      name: "Draft workflow",
      description: "",
      steps: [{ id: "one", name: "One", kind: "delay", timeoutSeconds: 1, config: {} }],
    },
    owner,
  );

  assert.throws(
    () => service.triggerRun(workspace.id, workflow.id, {}, "key-1", owner),
    /Only active workflows/,
  );
});
