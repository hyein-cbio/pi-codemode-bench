import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createFixture } from "../lib/fixtures.mjs";
import { hash } from "../lib/values.mjs";

export function decodeToolResult(result, format) {
  const blocks = result?.content ?? [];
  const texts = blocks.filter(b => b.type === "text").map(b => b.text);
  const error = result?.isError === true || result?.details?.ok === false;
  const truncated = Boolean(result?.details?.truncated || result?.details?.fullOutputPath);
  const warnings = result?.details?.warnings ?? [];
  if (error) return { ok: false, error: texts.join("\n") || "Tool execution failed", truncated, warnings };
  try {
    if (blocks.some(b => b.type !== "text")) throw new Error("Expected a data-only tool result");
    let value;
    if (format === "structured") {
      if (result.structuredContent === undefined) throw new Error("Missing structuredContent");
      value = result.structuredContent;
    } else if (format === "json-text") value = JSON.parse(texts.join("\n"));
    else if (format === "pi-codemode") {
      if (texts.length !== 2 || !texts[0].startsWith("Script completed")) throw new Error("Expected Pi completion header and one return value");
      try { value = JSON.parse(texts[1]); } catch { value = texts[1]; }
    } else throw new Error("Unknown result format: " + format);
    return { ok: true, value, truncated, warnings };
  } catch (error) { return { ok: false, transportError: true, error: "Invalid tool output: " + error.message, truncated, warnings }; }
}

// Real AgentSession dispatch of a scripted root tool call. Not a direct runtime alias.
// Session setup and scripted model turns are outside the root-tool event clock.
export async function openPiTool(target) {
  const pi = await import(pathToFileURL(join(target.sdk, "dist/index.js")).href);
  const require = createRequire(join(target.sdk, "package.json"));
  // pi-ai is import-only; require.resolve(main) cannot select its ESM export.
  let aiEntry;
  for (const base of require.resolve.paths("@earendil-works/pi-ai")) {
    const packageDir = join(base, "@earendil-works/pi-ai");
    try {
      const pkg = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8"));
      aiEntry = join(packageDir, pkg.exports?.["."]?.import ?? pkg.main);
      break;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  if (!aiEntry) throw new Error("Cannot resolve the configured SDK's pi-ai dependency");
  const { Type, createAssistantMessageEventStream } = await import(pathToFileURL(aiEntry).href);
  const sdkVersion = JSON.parse(await readFile(join(target.sdk, "package.json"), "utf8")).version;

  async function setup(fixture) {
    if (fixture.names.includes(target.tool)) throw new Error("Target tool collides with a fixture tool: " + target.tool);
    const dir = await mkdtemp(join(tmpdir(), "pi-bench-tool-"));
    let session;
    const close = async () => {
      try {
        if (session) {
          await session.abort();
          try { await session.extensionRunner.emit({ type: "session_shutdown" }); }
          finally { session.dispose(); }
        }
      } finally { await rm(dir, { recursive: true, force: true }); }
    };
    try {
      const names = [target.tool, ...fixture.names];
      const settingsManager = pi.SettingsManager.inMemory({ defaultTools: names, cacheWarming: "off",
        compaction: { enabled: false }, retry: { enabled: false } });
      const resourceLoader = new pi.DefaultResourceLoader({
        cwd: dir, agentDir: dir, settingsManager,
        noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
        systemPrompt: "Offline benchmark. Scripted tool calls and in-memory fixtures only.",
        additionalExtensionPaths: target.extensions.filter(p => p !== "builtin:codemode"),
        extensionFactories: [
          ...(target.extensions.includes("builtin:codemode") ? [pi.createCodemodeExtension()] : []),
          api => {
            for (const name of fixture.names) api.registerTool({
              name, label: name, description: "Controlled benchmark fixture",
              parameters: Type.Record(Type.String(), Type.Unknown()), outputSchema: Type.Unknown(),
              async execute(_id, args, signal) {
                const value = await fixture.call(name, args, signal);
                return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }],
                  structuredContent: value, details: {} };
              },
            });
            api.on("tool_call", event => {
              if (event.parentToolCallId && !fixture.names.includes(event.toolName)) return { block: true, reason: "Not a benchmark fixture tool" };
            });
          },
        ],
      });
      await resourceLoader.reload();
      const loaded = resourceLoader.getExtensions();
      if (loaded.errors.length) throw new Error("Extension load failed: " + JSON.stringify(loaded.errors));
      const owners = loaded.extensions.filter(extension => extension.tools.has(target.tool));
      if (owners.length !== 1) throw new Error("Configured Pi tool must be registered by exactly one explicit extension: " + target.tool + "; no runtime fallback");
      // Only explicit resources are loaded. Inline factories use pseudo-paths;
      // keep resolved absolute entry paths, including symlinked local packages.
      const filePaths = loaded.extensions.map(e => e.resolvedPath).filter(p => isAbsolute(p));
      const extensionHashes = Object.fromEntries(await Promise.all(filePaths.map(async p => [p, hash(await readFile(p))])));
      // Disposable explicit auth/catalog paths; never read ~/.pi or refresh a network catalog.
      const modelRuntime = await pi.ModelRuntime.create({ authPath: join(dir, "auth.json"), modelsPath: null,
        modelsStorePath: join(dir, "models.json"), allowModelNetwork: false, refreshOnCreate: false });
      await modelRuntime.setRuntimeApiKey("openai", "offline-benchmark-not-a-real-key");
      const model = modelRuntime.getModels("openai").find(m => m.type === undefined || m.type === "chat");
      if (!model) throw new Error("SDK has no offline model descriptor for scripted execution");
      ({ session } = await pi.createAgentSession({ cwd: dir, agentDir: dir, model, thinkingLevel: "off", modelRuntime,
        settingsManager, resourceLoader, sessionManager: pi.SessionManager.inMemory(dir), tools: names }));
      await session.bindExtensions({});
      if (!session.getAllTools().some(t => t.name === target.tool) || !session.getActiveToolNames().includes(target.tool)) {
        throw new Error("Configured Pi tool is not registered/active: " + target.tool + "; no runtime fallback");
      }
      // The model stub is installed before any prompt. No real inference is used.
      return { session, model, close, extensionHashes };
    } catch (error) { await close(); throw error; }
  }

  // Fail before a campaign starts if the extension or requested tool is missing.
  const preflight = await setup(createFixture());
  const extensionHashes = preflight.extensionHashes;
  await preflight.close();
  let sequence = 0;
  return {
    name: target.id, kind: "pi-tool", toolName: target.tool, target,
    language: target.language, capabilities: target.capabilities, version: sdkVersion,
    extensionHashes, maxToolCalls: target.maxToolCalls,
    lifecycle: "Fresh isolated Pi AgentSession per invocation; actual registered tool and nested Pi pipeline; no live model",
    clock: "Root tool_execution_start to tool_execution_end; session setup, scripted model turns and session shutdown excluded",
    async execute(code, { fixture = createFixture(), timeoutMs = 10000 } = {}) {
      const { session, model, close } = await setup(fixture);
      const id = "bench-root-" + (++sequence);
      const source = target.sourceOptions ? '// @options: {"timeout_ms":' + timeoutMs + '}\n' + code : code;
      const input = { ...target.input, [target.inputKey]: source };
      let turns = 0, started, ended, timer, rootResult, aborted = false;
      const unsubscribe = session.subscribe(event => {
        if (event.toolCallId !== id || event.parentToolCallId) return;
        if (event.type === "tool_execution_start") {
          started = performance.now();
          timer = setTimeout(() => { aborted = true; void session.abort().catch(() => {}); }, timeoutMs + 100);
        }
        if (event.type === "tool_execution_end") {
          ended = performance.now(); clearTimeout(timer);
          // Transcript messages omit structuredContent; the event retains it.
          rootResult = { ...event.result, isError: event.isError };
        }
      });
      session.agent.streamFunction = () => {
        if (++turns > 2) throw new Error("Unexpected continuation: live model fallback is forbidden");
        const stream = createAssistantMessageEventStream();
        const message = { role: "assistant", api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(),
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: turns === 1 ? "toolUse" : "stop",
          content: turns === 1 ? [{ type: "toolCall", id, name: target.tool, arguments: input }] : [{ type: "text", text: "done" }] };
        stream.push({ type: "done", reason: message.stopReason, message });
        stream.end(message);
        return stream;
      };
      try {
        await session.prompt("Execute the configured benchmark tool once.");
        const result = session.messages.findLast(m => m.role === "toolResult" && m.toolCallId === id && m.toolName === target.tool);
        if (!result || !rootResult) throw new Error("No result for configured tool: " + target.tool);
        const decoded = decodeToolResult(rootResult, target.resultFormat);
        // A caller abort is not a product-level deadline pass or a speed win.
        if (aborted) { decoded.ok = false; decoded.transportError = true; decoded.error = "Benchmark caller aborted before tool completion"; }
        return { ...decoded, ms: ended - started,
          toolAudit: { toolName: target.tool, toolCallId: id, inputHash: hash(JSON.stringify(input)),
            scriptedTurns: turns, liveModelRequests: 0, nestedCalls: result.nestedCalls ?? null } };
      } finally { clearTimeout(timer); unsubscribe(); await close(); }
    },
  };
}
