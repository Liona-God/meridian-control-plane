import { pathToFileURL } from "node:url";
import { FetchWorkerTickClient, type WorkerTickClient } from "./client.js";
import { loadWorkerConfig, type WorkerConfig } from "./config.js";

export class MeridianWorker {
  private running = false;

  public constructor(
    private readonly client: WorkerTickClient,
    private readonly config: Pick<WorkerConfig, "batchSize" | "pollIntervalMs">,
    private readonly logger: Pick<Console, "info" | "error"> = console,
  ) {}

  public async runOnce(): Promise<number> {
    const processed = await this.client.tick(this.config.batchSize);
    if (processed.length > 0) {
      this.logger.info("Processed " + processed.length + " workflow run step(s)");
    }
    return processed.length;
  }

  public async runForever(): Promise<void> {
    this.running = true;
    while (this.running) {
      try {
        await this.runOnce();
      } catch (error) {
        this.logger.error(error instanceof Error ? error.message : "Unknown worker error");
      }
      await new Promise<void>((resolve) => setTimeout(resolve, this.config.pollIntervalMs));
    }
  }

  public stop(): void {
    this.running = false;
  }
}

async function start(): Promise<void> {
  const config = loadWorkerConfig();
  const worker = new MeridianWorker(new FetchWorkerTickClient(config), config);
  const stop = () => worker.stop();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await worker.runForever();
}

const invokedFile = process.argv[1];
if (invokedFile && import.meta.url === pathToFileURL(invokedFile).href) {
  void start();
}
