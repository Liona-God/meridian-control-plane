import type { WorkflowRun } from "@meridian/contracts";
import type { WorkerConfig } from "./config.js";

export interface WorkerTickClient {
  tick(limit: number): Promise<WorkflowRun[]>;
}

export class FetchWorkerTickClient implements WorkerTickClient {
  public constructor(private readonly config: Pick<WorkerConfig, "apiUrl" | "workerToken">) {}

  public async tick(limit: number): Promise<WorkflowRun[]> {
    const response = await fetch(this.config.apiUrl + "/internal/worker/tick", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-worker-token": this.config.workerToken,
      },
      body: JSON.stringify({ limit }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json()) as
      | { data?: WorkflowRun[]; error?: { message?: string } }
      | undefined;
    if (!response.ok || !body?.data) {
      throw new Error(body?.error?.message || "Worker tick failed with HTTP " + response.status);
    }
    return body.data;
  }
}
