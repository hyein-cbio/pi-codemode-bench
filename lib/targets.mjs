import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { hash } from "./values.mjs";
import { packageRoot } from "./packages.mjs";

const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
function keys(value, allowed, label) {
  if (!record(value)) throw new Error(label + " must be an object");
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error("Unknown " + label + " key: " + key);
}
function strings(value, label, { empty = false } = {}) {
  if (!Array.isArray(value) || (!empty && !value.length) || value.some(v => typeof v !== "string" || !v.trim()) || new Set(value).size !== value.length) {
    throw new Error(label + " must be an array of unique nonempty strings");
  }
  return value;
}
function localPath(path, base) {
  if (typeof path !== "string" || !path.trim() || /^(?:[a-z][a-z0-9+.-]*:|~)/i.test(path)) {
    throw new Error("Use a local absolute or config-relative path, not a URL/package spec/~: " + path);
  }
  return resolve(base, path);
}
function executionFields(raw, defaultCapabilities = []) {
  const language = raw.language ?? "javascript";
  if (typeof language !== "string" || !/^[a-z][a-z0-9-]*$/.test(language)) throw new Error("Invalid language");
  const capabilities = strings(raw.capabilities ?? defaultCapabilities, "capabilities", { empty: true });
  const inputKey = raw.inputKey ?? "code", input = raw.input ?? {};
  if (typeof inputKey !== "string" || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(inputKey)) throw new Error("Invalid inputKey");
  if (!record(input) || Object.hasOwn(input, inputKey)) throw new Error("input must be an object without the source inputKey");
  if (raw.maxToolCalls !== undefined && (!Number.isSafeInteger(raw.maxToolCalls) || raw.maxToolCalls < 1)) throw new Error("maxToolCalls must be a positive integer");
  return { language, capabilities, inputKey, input, maxToolCalls: raw.maxToolCalls ?? null };
}
export function normalizeTargets(data, base) {
  keys(data, ["version", "targets", "sources"], "config");
  if (data.version !== 1 || !Array.isArray(data.targets) || !data.targets.length) throw new Error("Config requires version:1 and nonempty targets");
  const targets = data.targets.map((raw, index) => {
    keys(raw, ["id", "kind", "engine", "tool", "adapter", "options", "extensions", "sdk", "language", "capabilities", "inputKey", "input", "resultFormat", "sourceOptions", "maxToolCalls"], "target");
    const kind = raw.kind ?? (raw.adapter ? "tool" : "pi-tool");
    if (!["tool", "pi-tool", "runtime"].includes(kind)) throw new Error("Unknown target kind: " + kind);
    const id = raw.id ?? (kind === "runtime" ? raw.engine : raw.tool);
    if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(id)) throw new Error("Invalid target id at index " + index);
    if (kind === "runtime") {
      keys(raw, ["id", "kind", "engine", "adapter", "options"], "runtime target");
      if (raw.adapter !== undefined) {
        if (raw.engine !== undefined) throw new Error("Choose runtime engine or adapter, not both");
        const options = raw.options ?? {};
        if (!record(options)) throw new Error("options must be an object");
        return { id, kind, adapter: localPath(raw.adapter, base), options };
      }
      if (raw.options !== undefined || !["pi", "opencode", "node"].includes(raw.engine)) throw new Error("Unknown runtime engine");
      return { id, kind, engine: raw.engine };
    }
    if (kind === "tool") {
      keys(raw, ["id", "kind", "tool", "adapter", "options", "language", "capabilities", "inputKey", "input", "maxToolCalls"], "tool target");
      if (typeof raw.tool !== "string" || !raw.tool.trim() || raw.tool.length > 256) throw new Error("Invalid tool name");
      const adapter = localPath(raw.adapter, base);
      const options = raw.options ?? {};
      if (!record(options)) throw new Error("options must be an object");
      return { id, kind, tool: raw.tool, adapter, options, ...executionFields(raw) };
    }
    if (raw.adapter !== undefined || raw.options !== undefined) throw new Error("pi-tool target cannot specify a generic adapter/options");
    if (raw.engine !== undefined) throw new Error("pi-tool target cannot specify engine");
    if (typeof raw.tool !== "string" || !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/.test(raw.tool)) throw new Error("Invalid tool name");
    const extensions = strings(raw.extensions ?? (raw.tool === "codemode" ? ["builtin:codemode"] : []), "extensions")
      .map(path => path === "builtin:codemode" ? path : localPath(path, base));
    const builtin = raw.tool === "codemode" && extensions.includes("builtin:codemode");
    const execution = executionFields(raw, builtin ? ["tools", "classes", "deep-json", "per-call-deadline"] : ["tools"]);
    const resultFormat = raw.resultFormat ?? (builtin ? "pi-codemode" : "json-text");
    if (!["json-text", "pi-codemode", "structured"].includes(resultFormat)) throw new Error("Unknown resultFormat");
    const sourceOptions = raw.sourceOptions ?? builtin;
    if (typeof sourceOptions !== "boolean" || (sourceOptions && execution.language !== "javascript")) throw new Error("sourceOptions requires JavaScript and a boolean value");
    return { id, kind, tool: raw.tool, extensions, sdk: raw.sdk === undefined ? packageRoot("@earendil-works/pi-coding-agent", "pi") : localPath(raw.sdk, base),
      ...execution, resultFormat, sourceOptions };
  });
  if (new Set(targets.map(t => t.id)).size !== targets.length) throw new Error("Duplicate target id");
  return targets;
}
export async function loadTargets(config) {
  if (!config.configFile) return {
    file: null, sha256: null, targets: [], sourcePaths: (config.sources ?? []).map(p => localPath(p, process.cwd())),
    specs: [...config.engines.map(engine => ({ engine })), ...config.adapters.map(module => ({ module: resolve(module) }))],
  };
  const file = resolve(config.configFile), source = await readFile(file, "utf8");
  let data;
  try { data = JSON.parse(source); } catch (error) { throw new Error("Invalid config JSON: " + error.message); }
  const all = normalizeTargets(data, dirname(file));
  if (config.targets) for (const id of config.targets) if (!all.some(t => t.id === id)) throw new Error("Unknown target: " + id);
  const targets = all.filter(t => !config.targets || config.targets.includes(t.id));
  // Do not discover/install packages or execute adapter code while loading JSON.
  for (const target of targets.filter(t => t.adapter)) {
    const info = await stat(target.adapter).catch(() => { throw new Error("Target " + target.id + " adapter not found: " + target.adapter); });
    if (!info.isFile()) throw new Error("Tool adapter must be a local module file: " + target.adapter);
  }
  for (const target of targets.filter(t => t.kind === "pi-tool")) {
    for (const path of [...target.extensions.filter(p => p !== "builtin:codemode"), target.sdk]) {
      const info = await stat(path).catch(() => { throw new Error("Target " + target.id + " path not found: " + path); });
      if (!info.isFile() && !info.isDirectory()) throw new Error("Invalid target path: " + path);
    }
  }
  const sourcePaths = [...strings(data.sources ?? [], "sources", { empty: true }).map(p => localPath(p, dirname(file))),
    ...(config.sources ?? []).map(p => localPath(p, process.cwd()))];
  return { file, sha256: hash(source), targets, sourcePaths, specs: targets.map(target => target.kind === "runtime"
    ? target.adapter ? { module: target.adapter, options: target.options, id: target.id } : { engine: target.engine, id: target.id } : { target }) };
}
