import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { hash } from "./values.mjs";

// Optional package/Git identity for local extension entries, captured before timing.
export async function captureExtensionSource(entry) {
  const cwd = dirname(entry);
  const git = (...args) => {
    try { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
    catch { return null; }
  };
  const fileHash = async name => {
    try { return hash(await readFile(join(cwd, name))); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  };
  return { revision: git("rev-parse", "HEAD"), status: git("status", "--porcelain", "--", "."),
    packageSha256: await fileHash("package.json"), lockSha256: await fileHash("package-lock.json") };
}
