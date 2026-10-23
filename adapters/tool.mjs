import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isAbsolute } from "node:path";
import { createFixture } from "../lib/fixtures.mjs";
import { hash, valueHash } from "../lib/values.mjs";

// Host-neutral bridge. The module, not the benchmark core, knows how to reach
// a registered tool (local, RPC, another harness, etc.).
export async function openTool(target) {
  const sourceHash = hash(await readFile(target.adapter));
  const module = await import(pathToFileURL(target.adapter).href);
  if (typeof module.createToolClient !== "function") throw new Error("Tool adapter must export createToolClient");
  const client = await module.createToolClient({ options: target.options, toolName: target.tool });
  try {
    if (!client || typeof client.callTool !== "function") throw new Error("Tool client must implement callTool(name, input, context)");
    const files = client.implementationFiles ?? [];
    if (!Array.isArray(files) || files.some(p => typeof p !== "string" || !isAbsolute(p))) throw new Error("implementationFiles must be absolute local file paths");
    const extensionHashes = Object.fromEntries(await Promise.all([target.adapter, ...files].map(async file => [file, hash(await readFile(file))])));
    if (extensionHashes[target.adapter] !== sourceHash) throw new Error("Tool adapter changed during initialization");
    return {
      name: target.id, kind: "tool", toolName: target.tool, target,
      language: target.language, capabilities: target.capabilities, maxToolCalls: target.maxToolCalls,
      version: client.version ?? null, implementationHash: sourceHash,
      extensionHashes,
      lifecycle: client.lifecycle ?? "Client reused per worker; per-call lifecycle is adapter-defined",
      clock: "performance.now around awaited client.callTool; client initialization excluded",
      dispose: () => client.dispose?.(),
      async execute(code, { fixture = createFixture(), timeoutMs = 10000, signal } = {}) {
        const input = { ...target.input, [target.inputKey]: code };
        const inputHash = valueHash(input);
        const started = performance.now();
        // Throws are adapter/transport failures, never expected guest-error passes.
        const result = await client.callTool(target.tool, input, { fixture, timeoutMs, signal });
        const ms = performance.now() - started;
        if (!result || typeof result.ok !== "boolean") throw new Error("Tool client returned an invalid normalized result");
        return { ...result, ms, toolAudit: { toolName: target.tool, inputHash, transport: "configured-client" } };
      },
    };
  } catch (error) { await client?.dispose?.(); throw error; }
}
