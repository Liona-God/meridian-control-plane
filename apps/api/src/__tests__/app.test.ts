import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../app.js";

test("runs the governed workflow API end-to-end", async () => {
  const app = createApp({ config: { workerToken: "test-worker-token", databasePath: ":memory:" } });
  const ownerHeaders = { "x-api-key": "dev-owner-key" };
  try {
    const unauthenticated = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { slug: "acme-ops", name: "Acme Ops" },
    });
    assert.equal(unauthenticated.statusCode, 403);

    const workspaceResponse = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers: ownerHeaders,
      payload: { slug: "acme-ops", name: "Acme Ops" },
    });
    assert.equal(workspaceResponse.statusCode, 201);
    const workspace = workspaceResponse.json().data as { id: string };

    const workflowResponse = await app.inject({
      method: "POST",
      url: "/v1/workspaces/" + workspace.id + "/workflows",
      headers: ownerHeaders,
      payload: {
        name: "Deploy",
        description: "Deploy a release",
        steps: [
          { id: "validate", name: "Validate", kind: "http", timeoutSeconds: 30, config: {} },
          { id: "gate", name: "Approve", kind: "approval", timeoutSeconds: 300, config: {} },
        ],
      },
    });
    assert.equal(workflowResponse.statusCode, 201);
    const workflow = workflowResponse.json().data as { id: string };

    await app.inject({
      method: "POST",
      url: "/v1/workspaces/" + workspace.id + "/workflows/" + workflow.id + "/activate",
      headers: ownerHeaders,
    });
    const runResponse = await app.inject({
      method: "POST",
      url: "/v1/workspaces/" + workspace.id + "/workflows/" + workflow.id + "/runs",
      headers: { ...ownerHeaders, "idempotency-key": "deploy-1" },
      payload: { input: { version: "1.2.3" } },
    });
    assert.equal(runResponse.statusCode, 202);
    const run = runResponse.json().data as { id: string };

    await app.inject({
      method: "POST",
      url: "/internal/worker/tick",
      headers: { "x-worker-token": "test-worker-token" },
      payload: { limit: 10 },
    });
    const waitingResponse = await app.inject({
      method: "POST",
      url: "/internal/worker/tick",
      headers: { "x-worker-token": "test-worker-token" },
      payload: { limit: 10 },
    });
    assert.equal(waitingResponse.json().data[0].status, "waiting_approval");

    const approved = await app.inject({
      method: "POST",
      url: "/v1/workspaces/" + workspace.id + "/runs/" + run.id + "/approve",
      headers: ownerHeaders,
    });
    assert.equal(approved.statusCode, 200);
  } finally {
    await app.close();
  }
});
