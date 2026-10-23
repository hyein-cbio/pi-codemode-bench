import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { publicExample, comparisonTable } from "../lib/public-example.mjs";
import { hash } from "../lib/values.mjs";
import { isMain } from "../lib/main.mjs";

async function extensionProvenance(receipt) {
  const engine = receipt.engines.find(e => e.name === "codemode_o");
  const entries = Object.entries(engine?.extensionHashes ?? {});
  if (entries.length !== 1) throw new Error("Expected exactly one pi-opencode-mode extension entry");
  const [entry, observedHash] = entries[0];
  const source = await readFile(entry);
  if (hash(source) !== observedHash) throw new Error("Extension entry changed since measurement");
  const dir = dirname(entry);
  const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
  if (pkg.name !== "pi-opencode-mode") throw new Error("Expected the pi-opencode-mode package root");
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const version = async name => JSON.parse(await readFile(join(dir, "node_modules", name, "package.json"), "utf8")).version;
  return {
    repository: "https://github.com/hyein-cbio/pi-opencode-mode",
    revision: git("rev-parse", "HEAD"), packageVersion: pkg.version, entrySha256: observedHash,
    measuredSourceDirty: Boolean(git("diff", "--name-only", "HEAD", "--", "index.js", "package.json", "package-lock.json")),
    workingTreeDirty: Boolean(git("status", "--short")),
    lockSha256: hash(await readFile(join(dir, "package-lock.json"))),
    codeModeVersion: await version("@opencode/codemode"), effectVersion: await version("effect"),
    note: "Entry hash is checked against the measured receipt. Dependency metadata was inspected at export; imported dependency bytes are not recursively fingerprinted.",
  };
}
export async function publish(input, output) {
  const source = await readFile(resolve(input), "utf8"), receipt = JSON.parse(source);
  const extension = await extensionProvenance(receipt);
  const result = publicExample(receipt, { sourceReceiptSha256: hash(source), extension });
  result.publisherHashes = Object.fromEntries(await Promise.all(["scripts/publish-example.mjs", "lib/public-example.mjs"].map(async path =>
    [path, hash(await readFile(new URL("../" + path, import.meta.url)))])));
  const path = resolve(output);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  await writeFile(path + ".md", "# Pi codemode vs. codemode_o: full example\n\n" +
    "Single-host registered-tool replay. " + result.method.samples + " warm samples per eligible cell; " + result.method.warmup + " warmups and one first-invocation control.\n\n" +
    "Expected errors and unsupported cells are retained, not performance wins. No aggregate speedup or production ranking.\n\n" +
    comparisonTable(result) + "\n", { flag: "wx" });
  console.log("Wrote sanitized public artifact: " + path);
  console.log(comparisonTable(result, result.readmeCases));
  return result;
}
if (isMain(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error("Usage: node scripts/publish-example.mjs <local-receipt.json> <new-public-artifact.json>");
    await publish(process.argv[2], process.argv[3]);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
