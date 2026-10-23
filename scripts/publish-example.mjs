import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { publicExample, comparisonTable } from "../lib/public-example.mjs";
import { hash, equal } from "../lib/values.mjs";
import { captureExtensionSource } from "../lib/provenance.mjs";
import { isMain } from "../lib/main.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

export function verifyBenchmarkSource(receipt, cwd = root) {
  if (!/^[a-f0-9]{40}$/.test(receipt.git?.head ?? "") || receipt.git.status !== "") {
    throw new Error("Public comparisons require a clean committed benchmark source");
  }
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  if (git("rev-parse", "HEAD") !== receipt.git.head || git("status", "--porcelain", "--", ".")) {
    throw new Error("Export checkout must be clean and at the measured benchmark revision");
  }
  const entries = Object.entries(receipt.implementationHashes ?? {}).filter(([path]) => !path.startsWith("/"));
  if (!entries.length) throw new Error("Missing committed benchmark source hashes");
  for (const [path, expected] of entries) {
    if (!/^[a-f0-9]{64}$/.test(expected ?? "") || path.includes("..") || /[:\\\\\r\n]/.test(path)) {
      throw new Error("Invalid committed source identity");
    }
    let bytes;
    try {
      bytes = execFileSync("git", ["cat-file", "blob", receipt.git.head + ":./" + path],
        { cwd, stdio: ["ignore", "pipe", "ignore"] });
    } catch { throw new Error("Measured source is missing from benchmark revision: " + path); }
    if (hash(bytes) !== expected) throw new Error("Measured source differs from benchmark revision: " + path);
  }
}

export async function verifyExtensionSource(entry, expected) {
  if (!expected || expected.status !== "" || !/^[a-f0-9]{40}$/.test(expected.revision ?? "") ||
      !/^[a-f0-9]{64}$/.test(expected.packageSha256 ?? "") || !/^[a-f0-9]{64}$/.test(expected.lockSha256 ?? "")) {
    throw new Error("Missing clean measured extension source identity");
  }
  if (!equal(expected, await captureExtensionSource(entry))) throw new Error("Extension metadata changed since measurement");
  for (const [path, expectedHash] of [["index.js", hash(await readFile(entry))],
    ["package.json", expected.packageSha256], ["package-lock.json", expected.lockSha256]]) {
    const committed = execFileSync("git", ["cat-file", "blob", expected.revision + ":./" + path],
      { cwd: dirname(entry), stdio: ["ignore", "pipe", "ignore"] });
    if (hash(committed) !== expectedHash) throw new Error("Extension source differs from its measured revision");
  }
  return expected;
}

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
  const measured = await verifyExtensionSource(entry, engine.extensionSources?.[entry]);
  const version = async name => JSON.parse(await readFile(join(dir, "node_modules", name, "package.json"), "utf8")).version;
  return {
    repository: "https://github.com/hyein-cbio/pi-opencode-mode",
    revision: measured.revision, packageVersion: pkg.version, entrySha256: observedHash,
    measuredSourceDirty: false, workingTreeDirty: false,
    packageSha256: measured.packageSha256, lockSha256: measured.lockSha256,
    codeModeVersion: await version("@opencode/codemode"), effectVersion: await version("effect"),
    note: "Extension revision and package/lock hashes were captured before timing and verified at export. Installed dependency bytes are not recursively fingerprinted.",
  };
}
export async function publish(input, output) {
  const source = await readFile(resolve(input), "utf8"), receipt = JSON.parse(source);
  verifyBenchmarkSource(receipt);
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
