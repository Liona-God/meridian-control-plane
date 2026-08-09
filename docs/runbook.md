# Local API runbook

Start the API, then create a workspace with the local owner key. Save the id
as WORKSPACE_ID in your shell.

Create an approval-gated workflow:

    curl -X POST http://localhost:4010/v1/workspaces/WORKSPACE_ID/workflows \
      -H 'content-type: application/json' \
      -H 'x-api-key: dev-owner-key' \
      -d '{"name":"Release","description":"A gated release","steps":[{"id":"verify","name":"Verify","kind":"http","timeoutSeconds":30,"config":{}},{"id":"approval","name":"Approve","kind":"approval","timeoutSeconds":300,"config":{}}]}'

Activate it, then trigger it using a stable idempotency key. Repeating the
trigger command returns the original run instead of creating a duplicate.

    curl -X POST http://localhost:4010/v1/workspaces/WORKSPACE_ID/workflows/WORKFLOW_ID/activate \
      -H 'x-api-key: dev-owner-key'

    curl -X POST http://localhost:4010/v1/workspaces/WORKSPACE_ID/workflows/WORKFLOW_ID/runs \
      -H 'content-type: application/json' \
      -H 'x-api-key: dev-owner-key' \
      -H 'idempotency-key: release-2026-08-09' \
      -d '{"input":{"version":"2026.08.09"}}'

Call the protected worker tick twice: the first executes the HTTP-like step
and the second moves the run to waiting_approval. An owner can then approve it.

    curl -X POST http://localhost:4010/internal/worker/tick \
      -H 'content-type: application/json' \
      -H 'x-worker-token: dev-worker-token' \
      -d '{"limit":25}'

    curl -X POST http://localhost:4010/v1/workspaces/WORKSPACE_ID/runs/RUN_ID/approve \
      -H 'x-api-key: dev-owner-key'
