import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { buildCases } from "../corpus/index.mjs";
import { loadSources } from "../lib/sources.mjs";
import { sourceFor } from "../lib/runner.mjs";
import { valueHash } from "../lib/values.mjs";
const exec = promisify(execFile);

test("external source plugins preserve corpus contracts and supply custom fresh syntax", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bench-sources-"));
  try {
    const file = join(dir, "sources.mjs");
    await writeFile(file, 'export function createSources({seed,caseNames}) {if(seed!==719||!caseNames.includes("read-reduce"))throw new Error("context");return {language:"external",comment:{prefix:"/*",suffix:" */"},sources:{"even-squares-10":"return 220"}}}');
    const original = buildCases({seed:719}), before = valueHash(original);
    const loaded = await loadSources([file], original, 719);
    assert.equal(valueHash(original), before);
    assert.deepEqual(loaded.cases[0].plan, original[0].plan);
    assert.deepEqual(loaded.cases[0].expected, original[0].expected);
    assert.equal(loaded.cases[0].sources.external, "return 220");
    assert.equal(loaded.files[0].sha256.length, 64);
    assert.equal(sourceFor(loaded.cases[0], {language:"external",sourceComment:loaded.comments.external}, "fresh", 7), "/* benchmark nonce 7 */\nreturn 220");
    await assert.rejects(loadSources([file,file], original, 719), /Duplicate source plugin path/);
    for (const [name, result] of [
      ["unknown", {language:"external",sources:{missing:"return 1"}}],
      ["empty", {language:"external",sources:{"even-squares-10":""}}],
      ["overreach", {language:"external",expected:1,sources:{"even-squares-10":"return 1"}}],
      ["comment", {language:"external",comment:{prefix:"#\n"},sources:{"even-squares-10":"return 220"}}],
    ]) {
      const bad = join(dir, name + ".mjs");
      await writeFile(bad, "export function createSources(){return " + JSON.stringify(result) + "}");
      await assert.rejects(loadSources([bad], original, 719));
    }
    await writeFile(file, 'export function createSources(){return {language:"external",sources:{"even-squares-10":"updated source"}}}');
    assert.equal((await loadSources([file], original, 719)).cases[0].sources.external,"updated source");
    const second = join(dir, "duplicate.mjs");
    await writeFile(second, 'export function createSources(){return {language:"external",sources:{"even-squares-10":"return 220"}}}');
    await assert.rejects(loadSources([file,second], original, 719), /Duplicate source variant/);
  } finally { await rm(dir, {recursive:true,force:true}); }
});

test("config-relative sources and runtime modules work without modifying the installed corpus", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bench-external-"));
  try {
    await writeFile(join(dir,"source.mjs"), 'export function createSources(){return {language:"external",comment:{prefix:"#"},sources:{"even-squares-10":"external-program"}}}');
    await writeFile(join(dir,"runtime.mjs"), 'export function createAdapter({options}){if(options.marker!==7)throw new Error("options");return {name:"external",language:"external",capabilities:[],async execute(code){return {ok:true,value:code.endsWith("external-program")?220:0,ms:1}}}}');
    const config = join(dir,"targets.json"), out = join(dir,"out.json");
    await writeFile(config, JSON.stringify({version:1,sources:["./source.mjs"],targets:[{id:"external-runtime",kind:"runtime",adapter:"./runtime.mjs",options:{marker:7}}]}));
    const common = ["bench.mjs","--config="+config,"--sets=smoke","--source-mode=fresh","--warmup=0","--samples=1"];
    const checked = await exec(process.execPath,[...common,"--check"]);
    assert.equal(JSON.parse(checked.stdout).targets[0].eligible,1);
    await exec(process.execPath,[...common,"--out="+out]);
    const receipt = JSON.parse(await readFile(out,"utf8"));
    assert.equal(receipt.counts.invalid,0);
    assert.equal(receipt.sourceConfig.files[0].file,join(dir,"source.mjs"));
    assert.equal(receipt.engines[0].name,"external-runtime");
    assert.equal(new Set(receipt.rows.map(row=>row.sourceHash)).size,2);
    assert.ok(receipt.implementationHashes[join(dir,"runtime.mjs")]);
    assert.ok(receipt.implementationHashes[join(dir,"source.mjs")]);
    const empty = join(dir,"empty.json");
    await assert.rejects(exec(process.execPath,["bench.mjs","--config="+config,"--cases=read-reduce","--warmup=0","--samples=1","--out="+empty]));
    const noCases = JSON.parse(await readFile(empty,"utf8"));
    assert.equal(noCases.counts.executions,0);
    assert.equal(noCases.counts.unsupported,1);
    await assert.rejects(exec(process.execPath,["bench.mjs","--config="+config,"--cases=read-reduce","--check"]));
    await assert.rejects(exec(process.execPath,["bench.mjs","--config="+config,"--sets=all","--check","--strict-coverage"]));
    await writeFile(join(dir,"source.mjs"), 'export function createSources(){return {language:"external",sources:{"even-squares-10":"external-program"}}}');
    await assert.rejects(exec(process.execPath,[...common,"--check"]), /Fresh source comments not defined/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
