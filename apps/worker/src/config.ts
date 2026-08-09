export interface WorkerConfig {
  apiUrl: string;
  workerToken: string;
  pollIntervalMs: number;
  batchSize: number;
}

function readInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(name + " must be a positive integer");
  }
  return parsed;
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const apiUrl = env.MERIDIAN_API_URL || "http://localhost:4010";
  try {
    new URL(apiUrl);
  } catch {
    throw new Error("MERIDIAN_API_URL must be an absolute URL");
  }
  return {
    apiUrl: apiUrl.replace(/\/$/, ""),
    workerToken: env.MERIDIAN_WORKER_TOKEN || "dev-worker-token",
    pollIntervalMs: readInteger(env.MERIDIAN_POLL_INTERVAL_MS, 2_000, "MERIDIAN_POLL_INTERVAL_MS"),
    batchSize: readInteger(env.MERIDIAN_BATCH_SIZE, 25, "MERIDIAN_BATCH_SIZE"),
  };
}
