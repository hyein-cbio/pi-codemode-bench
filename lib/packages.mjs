import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function packageRoot(name, engine, dependencies = [name]) {
  let entry;
  try { entry = fileURLToPath(import.meta.resolve(name)); }
  catch (error) {
    if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
    const missing = new Error("Engine '" + engine + "' needs: npm i " + dependencies.join(" "));
    missing.code = "MISSING_ENGINE_DEPENDENCY";
    throw missing;
  }
  for (let dir = dirname(entry); ; dir = dirname(dir)) {
    try {
      if (JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).name === name) return dir;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (dirname(dir) === dir) throw new Error("Package root not found: " + name);
  }
}
