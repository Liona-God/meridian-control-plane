import { useState } from "react";
import type { RunStatus, Workflow, WorkflowRun } from "@meridian/contracts";
import { MeridianApiClient } from "./api";
import { demoRuns, demoWorkflows } from "./demo";
import "./styles.css";

interface Connection {
  baseUrl: string;
  workspaceId: string;
  apiKey: string;
}

function statusLabel(status: RunStatus): string {
  return status.replace("_", " ");
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export default function App() {
  const [workflows, setWorkflows] = useState<Workflow[]>(demoWorkflows);
  const [runs, setRuns] = useState<WorkflowRun[]>(demoRuns);
  const [selectedRunId, setSelectedRunId] = useState(demoRuns[0]?.id || "");
  const [connection, setConnection] = useState<Connection>({
    baseUrl: import.meta.env.VITE_MERIDIAN_API_URL || "http://localhost:4010",
    workspaceId: "",
    apiKey: "dev-owner-key",
  });
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  const selectedRun = runs.find((run) => run.id === selectedRunId) || runs[0] || null;
  const selectedWorkflow = selectedRun
    ? workflows.find((workflow) => workflow.id === selectedRun.workflowId)
    : workflows[0];
  const awaitingApproval = runs.filter((run) => run.status === "waiting_approval").length;
  const completed = runs.filter((run) => run.status === "succeeded").length;

  async function connect(): Promise<void> {
    setConnectionError(null);
    try {
      const client = new MeridianApiClient(connection.baseUrl, connection.apiKey);
      const [nextWorkflows, nextRuns] = await Promise.all([
        client.listWorkflows(connection.workspaceId),
        client.listRuns(connection.workspaceId),
      ]);
      setWorkflows(nextWorkflows);
      setRuns(nextRuns);
      setSelectedRunId(nextRuns[0]?.id || "");
      setIsLive(true);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Could not connect to Meridian API");
      setIsLive(false);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">M</span>
          <span>Meridian</span>
          <small>Control Plane</small>
        </div>
        <div className={"environment " + (isLive ? "live" : "demo")}>
          <span aria-hidden="true" />
          {isLive ? "Live API" : "Guided demo"}
        </div>
      </header>

      <main>
        <section className="intro">
          <div>
            <p className="eyebrow">Governed execution</p>
            <h1>Make operational change auditable by default.</h1>
            <p>
              Meridian turns repeatable work into versioned workflows with explicit
              authorization, idempotent triggers, approval gates, and durable audit events.
            </p>
          </div>
          <form
            className="connection-card"
            onSubmit={(event) => {
              event.preventDefault();
              void connect();
            }}
          >
            <div className="connection-title">
              <strong>Connect a workspace</strong>
              <span>Optional local API</span>
            </div>
            <label>
              API URL
              <input
                value={connection.baseUrl}
                onChange={(event) => setConnection({ ...connection, baseUrl: event.target.value })}
              />
            </label>
            <div className="connection-grid">
              <label>
                Workspace ID
                <input
                  value={connection.workspaceId}
                  onChange={(event) => setConnection({ ...connection, workspaceId: event.target.value })}
                  placeholder="UUID"
                />
              </label>
              <label>
                API key
                <input
                  value={connection.apiKey}
                  onChange={(event) => setConnection({ ...connection, apiKey: event.target.value })}
                />
              </label>
            </div>
            {connectionError ? <p role="alert" className="error">{connectionError}</p> : null}
            <button type="submit">Load workspace</button>
          </form>
        </section>

        <section className="metrics" aria-label="Workflow metrics">
          <Metric label="Active workflows" value={workflows.filter((item) => item.status === "active").length} detail="Versioned and triggerable" />
          <Metric label="Awaiting approval" value={awaitingApproval} detail="Owner action required" />
          <Metric label="Completed runs" value={completed} detail="In this control view" />
        </section>

        <section className="console">
          <section className="panel workflow-panel" aria-labelledby="workflow-heading">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Definitions</p>
                <h2 id="workflow-heading">Workflow catalog</h2>
              </div>
              <span>{workflows.length} active</span>
            </div>
            <div className="workflow-list">
              {workflows.map((workflow) => (
                <article key={workflow.id} className="workflow-card">
                  <div>
                    <span className="version">V{workflow.version}</span>
                    <h3>{workflow.name}</h3>
                    <p>{workflow.description}</p>
                  </div>
                  <ol aria-label={workflow.name + " steps"}>
                    {workflow.definition.steps.map((step, index) => (
                      <li key={step.id}>
                        <span>{index + 1}</span>
                        <div><strong>{step.name}</strong><small>{step.kind}</small></div>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          </section>

          <section className="panel runs-panel" aria-labelledby="runs-heading">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Execution</p>
                <h2 id="runs-heading">Recent runs</h2>
              </div>
              <span>{runs.length} retained</span>
            </div>
            <div className="run-list">
              {runs.map((run) => (
                <button
                  className={"run-row " + (run.id === selectedRun?.id ? "selected" : "")}
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  aria-pressed={run.id === selectedRun?.id}
                >
                  <span className={"status-dot " + run.status} aria-hidden="true" />
                  <span><strong>{workflows.find((workflow) => workflow.id === run.workflowId)?.name || "Unknown workflow"}</strong><small>{run.triggerKey}</small></span>
                  <span className="run-time">{formatTime(run.updatedAt)}</span>
                  <span className={"status " + run.status}>{statusLabel(run.status)}</span>
                </button>
              ))}
            </div>
          </section>

          <aside className="panel detail-panel" aria-label="Selected run detail">
            {selectedRun && selectedWorkflow ? (
              <>
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Run detail</p>
                    <h2>{selectedWorkflow.name}</h2>
                  </div>
                  <span className={"status " + selectedRun.status}>{statusLabel(selectedRun.status)}</span>
                </div>
                <dl className="run-facts">
                  <div><dt>Workflow version</dt><dd>V{selectedRun.workflowVersion}</dd></div>
                  <div><dt>Trigger key</dt><dd>{selectedRun.triggerKey}</dd></div>
                  <div><dt>Current step</dt><dd>{Math.min(selectedRun.currentStepIndex + 1, selectedWorkflow.definition.steps.length)} of {selectedWorkflow.definition.steps.length}</dd></div>
                  <div><dt>Created</dt><dd>{formatTime(selectedRun.createdAt)}</dd></div>
                </dl>
                <section className="step-progress" aria-labelledby="progress-heading">
                  <h3 id="progress-heading">Execution path</h3>
                  <ol>
                    {selectedWorkflow.definition.steps.map((step, index) => {
                      const state =
                        index < selectedRun.currentStepIndex
                          ? "complete"
                          : index === selectedRun.currentStepIndex
                            ? "current"
                            : "pending";
                      return (
                        <li className={state} key={step.id}>
                          <span>{index + 1}</span>
                          <div><strong>{step.name}</strong><small>{step.kind} · {step.timeoutSeconds}s timeout</small></div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
                <details>
                  <summary>Inspect immutable input and output</summary>
                  <pre>{JSON.stringify({ input: selectedRun.input, output: selectedRun.output }, null, 2)}</pre>
                </details>
              </>
            ) : (
              <p className="empty">Choose a workflow run to inspect its execution state.</p>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}
