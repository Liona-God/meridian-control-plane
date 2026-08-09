import type { Workflow, WorkflowRun } from "@meridian/contracts";

export const demoWorkflows: Workflow[] = [
  {
    id: "wf_release",
    workspaceId: "ws_demo",
    name: "Production release",
    description: "Validate, gate, and deploy a production release.",
    status: "active",
    version: 4,
    definition: {
      name: "Production release",
      description: "Validate, gate, and deploy a production release.",
      steps: [
        { id: "verify", name: "Verify artifacts", kind: "http", timeoutSeconds: 60, config: {} },
        { id: "approval", name: "Owner approval", kind: "approval", timeoutSeconds: 900, config: {} },
        { id: "deploy", name: "Deploy canary", kind: "http", timeoutSeconds: 300, config: {} },
      ],
    },
    createdBy: "usr_demo",
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T12:30:00.000Z",
  },
  {
    id: "wf_reconcile",
    workspaceId: "ws_demo",
    name: "Ledger reconciliation",
    description: "Execute the nightly reconciliation with anomaly quarantine.",
    status: "active",
    version: 2,
    definition: {
      name: "Ledger reconciliation",
      description: "Execute the nightly reconciliation with anomaly quarantine.",
      steps: [
        { id: "extract", name: "Extract records", kind: "http", timeoutSeconds: 180, config: {} },
        { id: "reconcile", name: "Reconcile deltas", kind: "delay", timeoutSeconds: 120, config: {} },
      ],
    },
    createdBy: "usr_demo",
    createdAt: "2026-08-08T20:00:00.000Z",
    updatedAt: "2026-08-09T04:30:00.000Z",
  },
];

export const demoRuns: WorkflowRun[] = [
  {
    id: "run_20260809_01",
    workspaceId: "ws_demo",
    workflowId: "wf_release",
    workflowVersion: 4,
    status: "waiting_approval",
    triggerKey: "release-2026.08.09",
    input: { version: "2026.08.09", changeTicket: "CHG-2841" },
    currentStepIndex: 1,
    output: { verify: { artifact: "sha256:817a", checks: "passed" } },
    createdBy: "usr_release_bot",
    createdAt: "2026-08-09T12:17:00.000Z",
    updatedAt: "2026-08-09T12:19:00.000Z",
  },
  {
    id: "run_20260809_02",
    workspaceId: "ws_demo",
    workflowId: "wf_reconcile",
    workflowVersion: 2,
    status: "succeeded",
    triggerKey: "ledger-2026-08-09",
    input: { ledgerDate: "2026-08-09" },
    currentStepIndex: 2,
    output: { extract: { rows: 148_203 }, reconcile: { unmatched: 0 } },
    createdBy: "usr_finance_bot",
    createdAt: "2026-08-09T04:01:00.000Z",
    updatedAt: "2026-08-09T04:08:00.000Z",
  },
];
