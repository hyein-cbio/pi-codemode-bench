import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function isMain(url, entry = process.argv[1]) {
  try { return Boolean(entry) && realpathSync(fileURLToPath(url)) === realpathSync(resolve(entry)); }
  catch { return false; }
}
