import { define, call } from "./helpers.mjs";

const files = {
  "package.json": '{"name":"fixture-app","scripts":{"test":"node --test","build":"tsc"}}',
  "src/api.ts": "// TODO: validate input\nexport const api = 1;\n",
  "src/user.ts": "// FIXME: missing user\n// TODO: cache\nexport const user = 2;\n",
  "numbers.txt": "3\n-2\n17\n0\n8\n",
};
const read = (path, extra) => call("read", { path }, files[path], extra);
export function shortCases() {
  const specs = [
    { name: "read-reduce", code: 'const raw = await tools.read({path:"numbers.txt"}); return raw.trim().split("\\n").map(Number).reduce((a,b)=>a+b,0);',
      plan: [read("numbers.txt")], expected: 26, tags: ["read", "reduction"],
      sources: { python: 'raw = tools.read({"path": "numbers.txt"})\nresult = sum(int(n) for n in raw.split())' } },
    { name: "config-summary", code: 'const p = JSON.parse(await tools.read({path:"package.json"})); return {name:p.name,scripts:Object.keys(p.scripts).sort()};',
      plan: [read("package.json")], expected: { name: "fixture-app", scripts: ["build", "test"] } },
    { name: "parallel-context", code: 'const texts = await Promise.all(["src/api.ts","src/user.ts"].map(path=>tools.read({path}))); return texts.map(s=>s.split("\\n").filter(line=>line.includes("TODO")).length);',
      plan: [read("src/api.ts", { waitMs: 2 }), read("src/user.ts", { waitMs: 2 })], expected: [1, 1],
      concurrency: { minPeak: 2, maxPeak: 2 }, tags: ["parallel"] },
    { name: "optional-context", code: 'const r = await Promise.allSettled(["src/api.ts","missing.ts","src/user.ts"].map(path=>tools.read({path}))); return r.map(x=>x.status);',
      plan: [read("src/api.ts"), call("read", { path: "missing.ts" }, null, { error: "NOT_FOUND" }), read("src/user.ts")],
      expected: ["fulfilled", "rejected", "fulfilled"], tags: ["partial-failure"] },
    { name: "find-then-read", code: 'const paths = await tools.list({glob:"src/*.ts"}); const path = paths.sort()[0]; const s = await tools.read({path}); return {path,todo:s.includes("TODO")};',
      plan: [call("list", { glob: "src/*.ts" }, ["src/user.ts", "src/api.ts"]), read("src/api.ts", { after: [0] })],
      expected: { path: "src/api.ts", todo: true }, tags: ["dependency"] },
    { name: "context-triage", tier: 2, code: `
const paths = ["src/api.ts","src/user.ts"];
const texts = await Promise.all(paths.map(path=>tools.read({path})));
const findings = [];
for (let f = 0; f < paths.length; f++) {
  const lines = texts[f].split("\\n");
  for (let i = 0; i < lines.length; i++) {
    const severity = lines[i].includes("FIXME") ? 2 : lines[i].includes("TODO") ? 1 : 0;
    if (severity) findings.push({path:paths[f],line:i+1,severity});
  }
}
findings.sort((a,b)=>b.severity-a.severity || (a.path<b.path?-1:a.path>b.path?1:0) || a.line-b.line);
return findings;`,
      plan: [read("src/api.ts"), read("src/user.ts")],
      expected: [{ path: "src/user.ts", line: 1, severity: 2 }, { path: "src/api.ts", line: 1, severity: 1 }, { path: "src/user.ts", line: 2, severity: 1 }],
      tags: ["branching", "sorting"] },
  ];
  for (const [count, waitMs] of [[8, 0], [64, 0], [256, 0], [8, 20], [8, 100]]) {
    const diagnostics = Array.from({ length: count }, (_, i) => ({ file: "src/f" + i + ".ts", severity: i % 3 === 0 ? "error" : "warning", line: i + 1, message: "controlled diagnostic " + i }));
    specs.push({
      name: "diagnostics-" + count + "-wait-" + waitMs,
      code: 'const rows = await tools.diagnostics({scope:"src"}); return rows.filter(r=>r.severity==="error").map(r=>r.line);',
      plan: [call("diagnostics", { scope: "src" }, diagnostics, { waitMs })],
      expected: Array.from({ length: Math.ceil(count / 3) }, (_, i) => i * 3 + 1),
      axes: { replyBytes: Buffer.byteLength(JSON.stringify(diagnostics)), artificialWaitMs: waitMs, rows: count },
      tags: ["reply-size", "wait-control"],
    });
  }
  return specs.map(s => define({ suite: "short", tier: 1, kind: "tool-orchestration", ...s }));
}
