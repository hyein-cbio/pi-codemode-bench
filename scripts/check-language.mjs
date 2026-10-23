import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isMain } from "../lib/main.mjs";

export function containsHangul(text) {
  return /\p{Script=Hangul}/u.test(text);
}
export async function checkRepository(root = process.cwd()) {
  // Include new, unstaged files; omit ignored local receipts and dependencies.
  const paths = [...new Set(execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean))];
  const violations = [];
  for (const path of paths) {
    if (containsHangul(path)) violations.push({ path, line: 0 });
    let bytes;
    try { bytes = await readFile(resolve(root, path)); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (bytes.includes(0)) continue; // Binary assets are not text documents.
    bytes.toString("utf8").split("\n").forEach((line, index) => {
      if (containsHangul(line)) violations.push({ path, line: index + 1 });
    });
  }
  return { files: paths.length, violations };
}
if (isMain(import.meta.url)) {
  const result = await checkRepository();
  if (result.violations.length) {
    for (const { path, line } of result.violations) console.error(path + ":" + line + ": non-English Hangul content");
    process.exitCode = 1;
  } else console.log("English-only policy check passed for " + result.files + " repository files (no Hangul).");
}
