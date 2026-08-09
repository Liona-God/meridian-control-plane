import { DomainError, type Actor } from "@meridian/core";

export interface ApiConfig {
  port: number;
  databasePath: string;
  corsOrigin: string;
  workerToken: string;
  apiKeys: Map<string, Actor>;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new DomainError("validation", name + " must be a valid positive integer");
  }
  return parsed;
}

function parseApiKeys(raw: string | undefined): Map<string, Actor> {
  if (!raw) {
    return new Map([
      ["dev-owner-key", { userId: "usr_owner", displayName: "Local Owner" }],
      ["dev-editor-key", { userId: "usr_editor", displayName: "Local Editor" }],
      ["dev-viewer-key", { userId: "usr_viewer", displayName: "Local Viewer" }],
    ]);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DomainError("validation", "MERIDIAN_API_KEYS_JSON must be valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new DomainError("validation", "MERIDIAN_API_KEYS_JSON must be an object");
  }
  const keys = new Map<string, Actor>();
  for (const [key, value] of Object.entries(parsed)) {
    const principal = value as Record<string, unknown>;
    if (
      typeof value !== "object" ||
      value === null ||
      typeof principal.userId !== "string" ||
      typeof principal.displayName !== "string"
    ) {
      throw new DomainError("validation", "Each API key principal must contain userId and displayName");
    }
    keys.set(key, {
      userId: principal.userId,
      displayName: principal.displayName,
    });
  }
  return keys;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    port: positiveInteger(env.PORT, 4010, "PORT"),
    databasePath: env.DATABASE_PATH || "./meridian.db",
    corsOrigin: env.CORS_ORIGIN || "http://localhost:5173",
    workerToken: env.MERIDIAN_WORKER_TOKEN || "dev-worker-token",
    apiKeys: parseApiKeys(env.MERIDIAN_API_KEYS_JSON),
  };
}
