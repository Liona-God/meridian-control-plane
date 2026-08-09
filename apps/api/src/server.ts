import { pathToFileURL } from "node:url";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

async function start(): Promise<void> {
  const config = loadConfig();
  const app = createApp({ config });
  await app.listen({ port: config.port, host: "0.0.0.0" });
}

const invokedFile = process.argv[1];
if (invokedFile && import.meta.url === pathToFileURL(invokedFile).href) {
  void start();
}
