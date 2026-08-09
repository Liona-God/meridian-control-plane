import assert from "node:assert/strict";
import test from "node:test";
import { ControlPlaneService, DeterministicStepExecutor } from "@meridian/core";
import { SqliteControlPlaneStore } from "../index.js";

test("persists workflow aggregates through the durable store adapter", async () => {
  const store = new SqliteControlPlaneStore(":memory:");
  try {
    const service = new ControlPlaneService(store);
    const actor = { userId: "usr_owner", displayName: "Owner" };
    const workspace = service.createWorkspace({ slug: "sqlite-ops", name: "SQLite Ops" }, actor);
    const workflow = service.createWorkflow(
      workspace.id,
      {
        name: "One step",
        description: "",
        steps: [{ id: "step", name: "Run", kind: "delay", timeoutSeconds: 1, config: {} }],
      },
      actor,
    );
    service.activateWorkflow(workspace.id, workflow.id, actor);
    const created = service.triggerRun(workspace.id, workflow.id, {}, "sqlite-run-1", actor);
    await service.processRunnableRuns(new DeterministicStepExecutor());

    const result = service.getRun(workspace.id, created.run.id, actor);
    assert.equal(result.run.status, "succeeded");
    assert.equal(store.listOutbox(workspace.id).length, 2);
  } finally {
    store.close();
  }
});
