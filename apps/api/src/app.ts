import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import {
  ControlPlaneService,
  DeterministicStepExecutor,
  DomainError,
  type Actor,
} from "@meridian/core";
import { SqliteControlPlaneStore } from "@meridian/database";
import { isRole } from "@meridian/contracts";
import { z } from "zod";
import { loadConfig, type ApiConfig } from "./config.js";

export interface CreateAppOptions {
  config?: Partial<ApiConfig>;
  service?: ControlPlaneService;
}

const workspaceBody = z.object({
  slug: z.string().min(3).max(48),
  name: z.string().min(1).max(120),
});

const memberBody = z.object({
  userId: z.string().min(1).max(120),
  displayName: z.string().min(1).max(120),
  role: z.enum(["owner", "editor", "viewer"]),
});

const workflowBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2_000).default(""),
  steps: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        name: z.string().min(1).max(160),
        kind: z.enum(["http", "approval", "delay"]),
        timeoutSeconds: z.number().int().min(1).max(3_600),
        config: z.record(z.unknown()).default({}),
      }),
    )
    .min(1)
    .max(50),
});

const triggerBody = z.object({
  input: z.record(z.unknown()).default({}),
});

const tickBody = z.object({
  limit: z.number().int().min(1).max(100).default(25),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new DomainError("validation", issue?.message || "Invalid request body");
  }
  return result.data;
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function workspaceId(request: FastifyRequest): string {
  const value = (request.params as { workspaceId?: string }).workspaceId;
  if (!value) {
    throw new DomainError("validation", "workspaceId is required");
  }
  return value;
}

function parameter(request: FastifyRequest, name: "workflowId" | "runId"): string {
  const value = (request.params as Record<string, string | undefined>)[name];
  if (!value) {
    throw new DomainError("validation", name + " is required");
  }
  return value;
}

export function createApp(options: CreateAppOptions = {}): FastifyInstance {
  const loaded = loadConfig();
  const config: ApiConfig = {
    port: options.config?.port ?? loaded.port,
    databasePath: options.config?.databasePath ?? loaded.databasePath,
    corsOrigin: options.config?.corsOrigin ?? loaded.corsOrigin,
    workerToken: options.config?.workerToken ?? loaded.workerToken,
    apiKeys: options.config?.apiKeys ?? loaded.apiKeys,
  };
  const store = options.service ? undefined : new SqliteControlPlaneStore(config.databasePath);
  const service = options.service ?? new ControlPlaneService(store!);
  const app = Fastify({
    logger: true,
    bodyLimit: 1_048_576,
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
  });

  app.addHook("onClose", () => {
    store?.close();
  });

  function actor(request: FastifyRequest): Actor {
    const key = header(request, "x-api-key");
    if (!key || !config.apiKeys.has(key)) {
      throw new DomainError("forbidden", "A valid x-api-key header is required");
    }
    return config.apiKeys.get(key) as Actor;
  }

  void app.register(cors, {
    origin: config.corsOrigin,
    methods: ["GET", "POST"],
  });

  app.get("/healthz", async () => ({ status: "ok", service: "meridian-api" }));

  app.post("/v1/workspaces", async (request, reply) => {
    const workspace = service.createWorkspace(parse(workspaceBody, request.body), actor(request));
    return reply.status(201).send({ data: workspace });
  });

  app.post("/v1/workspaces/:workspaceId/members", async (request, reply) => {
    const body = parse(memberBody, request.body);
    if (!isRole(body.role)) {
      throw new DomainError("validation", "Invalid role");
    }
    const member = service.addMember(workspaceId(request), body, actor(request));
    return reply.status(201).send({ data: member });
  });

  app.get("/v1/workspaces/:workspaceId/workflows", async (request) => ({
    data: service.listWorkflows(workspaceId(request), actor(request)),
  }));

  app.post("/v1/workspaces/:workspaceId/workflows", async (request, reply) => {
    const body = parse(workflowBody, request.body);
    const workflow = service.createWorkflow(
      workspaceId(request),
      {
        name: body.name,
        description: body.description || "",
        steps: body.steps.map((step) => ({
          ...step,
          config: step.config || {},
        })),
      },
      actor(request),
    );
    return reply.status(201).send({ data: workflow });
  });

  app.post("/v1/workspaces/:workspaceId/workflows/:workflowId/activate", async (request) => ({
    data: service.activateWorkflow(
      workspaceId(request),
      parameter(request, "workflowId"),
      actor(request),
    ),
  }));

  app.post("/v1/workspaces/:workspaceId/workflows/:workflowId/runs", async (request, reply) => {
    const triggerKey = header(request, "idempotency-key");
    if (!triggerKey) {
      throw new DomainError("validation", "idempotency-key header is required");
    }
    const body = parse(triggerBody, request.body);
    const result = service.triggerRun(
      workspaceId(request),
      parameter(request, "workflowId"),
      body.input || {},
      triggerKey,
      actor(request),
    );
    return reply.status(result.created ? 202 : 200).send({
      data: result.run,
      meta: { idempotentReplay: !result.created },
    });
  });

  app.get("/v1/workspaces/:workspaceId/runs", async (request) => ({
    data: service.listRuns(workspaceId(request), actor(request)),
  }));

  app.get("/v1/workspaces/:workspaceId/runs/:runId", async (request) => ({
    data: service.getRun(workspaceId(request), parameter(request, "runId"), actor(request)),
  }));

  app.post("/v1/workspaces/:workspaceId/runs/:runId/approve", async (request) => ({
    data: service.approveRun(workspaceId(request), parameter(request, "runId"), actor(request)),
  }));

  app.post("/v1/workspaces/:workspaceId/runs/:runId/cancel", async (request) => ({
    data: service.cancelRun(workspaceId(request), parameter(request, "runId"), actor(request)),
  }));

  app.post("/internal/worker/tick", async (request) => {
    if (header(request, "x-worker-token") !== config.workerToken) {
      throw new DomainError("forbidden", "A valid worker token is required");
    }
    const body = parse(tickBody, request.body || {});
    const runs = await service.processRunnableRuns(new DeterministicStepExecutor(), body.limit);
    return { data: runs, meta: { processed: runs.length } };
  });

  app.setErrorHandler((error, request, reply) => {
    const known = error instanceof DomainError ? error : undefined;
    const statusCode =
      known?.code === "validation"
        ? 400
        : known?.code === "forbidden"
          ? 403
          : known?.code === "not_found"
            ? 404
            : known?.code === "conflict"
              ? 409
              : known?.code === "invalid_state"
                ? 422
                : 500;
    if (!known) {
      request.log.error({ err: error }, "Unhandled request error");
    }
    void reply.status(statusCode).send({
      error: {
        code: known?.code || "internal_error",
        message: known ? known.message : "Internal server error",
        requestId: request.id,
      },
    });
  });

  return app;
}
