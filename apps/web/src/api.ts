import type { Workflow, WorkflowRun, WorkflowRunView } from "@meridian/contracts";

interface ApiEnvelope<T> {
  data: T;
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string };
}

export class MeridianApiClient {
  public constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  public async listWorkflows(workspaceId: string): Promise<Workflow[]> {
    return this.request<Workflow[]>("/v1/workspaces/" + workspaceId + "/workflows");
  }

  public async listRuns(workspaceId: string): Promise<WorkflowRun[]> {
    return this.request<WorkflowRun[]>("/v1/workspaces/" + workspaceId + "/runs");
  }

  public async getRun(workspaceId: string, runId: string): Promise<WorkflowRunView> {
    return this.request<WorkflowRunView>("/v1/workspaces/" + workspaceId + "/runs/" + runId);
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(this.baseUrl.replace(/\/$/, "") + path, {
      headers: { "x-api-key": this.apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json()) as ApiEnvelope<T> & ErrorEnvelope;
    if (!response.ok) {
      throw new Error(body.error?.message || "Request failed with HTTP " + response.status);
    }
    return body.data;
  }
}
