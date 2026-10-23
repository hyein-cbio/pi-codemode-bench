import { createJsonlClient } from "../index.mjs";
import { fileURLToPath } from "node:url";

export async function createToolClient({ options = {} } = {}) {
  const client = await createJsonlClient({
    command: options.command ?? "python3",
    args: ["-I", "-u", fileURLToPath(new URL("./python-jsonl-server.py", import.meta.url))],
  });
  client.implementationFiles = [fileURLToPath(new URL("./python-jsonl-server.py", import.meta.url))];
  return client;
}
