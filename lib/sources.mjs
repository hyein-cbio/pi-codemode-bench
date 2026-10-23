import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { hash } from "./values.mjs";

// Plugins supply programs only; plans, expected values and requirements stay owned
// by the corpus. This is trusted host code, not a translation sandbox.
export async function loadSources(paths, original, seed) {
  if (new Set(paths).size !== paths.length) throw new Error("Duplicate source plugin path");
  const cases = original.map(item => ({ ...item, sources: { ...item.sources } }));
  const byName = new Map(cases.map(item => [item.name, item])), assigned = new Set(), comments = Object.create(null), files = [];
  for (const file of paths) {
    const sha256 = hash(await readFile(file));
    const module = await import(pathToFileURL(file).href + "?sha256=" + sha256);
    if (typeof module.createSources !== "function") throw new Error("Source plugin must export createSources: " + file);
    const plugin = await module.createSources({ seed, caseNames: Object.freeze([...byName.keys()]) });
    if (!plugin || Object.keys(plugin).some(key => !["language", "sources", "comment"].includes(key))
      || typeof plugin.language !== "string" || !/^[a-z][a-z0-9-]*$/.test(plugin.language)
      || !plugin.sources || typeof plugin.sources !== "object" || Array.isArray(plugin.sources)
      || !Object.keys(plugin.sources).length) throw new Error("Invalid source plugin result: " + file);
    if (plugin.comment !== undefined) {
      const { prefix, suffix = "" } = plugin.comment ?? {};
      if (typeof prefix !== "string" || !prefix || typeof suffix !== "string" || /[\r\n]/.test(prefix + suffix)
        || Object.keys(plugin.comment).some(key => !["prefix", "suffix"].includes(key))) throw new Error("Invalid source comment syntax");
      const comment = { prefix, suffix };
      if (comments[plugin.language] && JSON.stringify(comments[plugin.language]) !== JSON.stringify(comment)) throw new Error("Conflicting source comment syntax");
      comments[plugin.language] = comment;
    }
    for (const [name, code] of Object.entries(plugin.sources)) {
      const item = byName.get(name), key = plugin.language + ":" + name;
      if (!item) throw new Error("Unknown source plugin case: " + name);
      if (typeof code !== "string" || !code.trim()) throw new Error("Source must be a nonempty string: " + key);
      if (assigned.has(key)) throw new Error("Duplicate source variant: " + key);
      assigned.add(key); item.sources[plugin.language] = code;
    }
    files.push({ file, sha256, language: plugin.language, cases: Object.keys(plugin.sources) });
  }
  return { cases, comments, files };
}
