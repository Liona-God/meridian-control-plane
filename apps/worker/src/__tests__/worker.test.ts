import assert from "node:assert/strict";
import test from "node:test";
import { MeridianWorker } from "../worker.js";

test("processes a bounded worker tick and reports the count", async () => {
  const observed: number[] = [];
  const worker = new MeridianWorker(
    {
      async tick(limit) {
        observed.push(limit);
        return [
          {
            id: "run_1",
            workspaceId: "ws_1",
            workflowId: "wf_1",
            workflowVersion: 1,
            status: "running",
            triggerKey: "key",
            input: {},
            currentStepIndex: 1,
            output: {},
            createdBy: "usr_1",
            createdAt: "2026-08-09T12:00:00.000Z",
            updatedAt: "2026-08-09T12:00:01.000Z",
          },
        ];
      },
    },
    { batchSize: 7, pollIntervalMs: 1 },
    { info: () => undefined, error: () => undefined },
  );

  assert.equal(await worker.runOnce(), 1);
  assert.deepEqual(observed, [7]);
});
