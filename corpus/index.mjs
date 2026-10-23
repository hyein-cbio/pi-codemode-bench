import { cases as legacy } from "../cases.mjs";
import { define } from "./helpers.mjs";
import { shortCases } from "./short.mjs";
import { workflowCases, apexCases } from "./workflow.mjs";
import { jsonScaleCases, sourceCases, stressCases, boundaryCases } from "./scale.mjs";

export const suites = {
  smoke: "Small startup and compute controls (tier 0)",
  micro: "Original loop, array, object and string controls (tier 1)",
  short: "Coding-shaped reads, context, partial failure, triage and wait controls (tiers 1–2)",
  workflow: "Pagination, join, selective retry, malformed input ETL (tier 3)",
  apex: "Version reconciliation, DAG and deep bridge composition (tier 4)",
  stress: "CPU, sorting, graph, allocation and bridge pressure (tier 5; opt in)",
  "json-scale": "Orthogonal 2–48 KiB × two shapes × 1/4/16 parse passes",
  source: "Orthogonal source/compile-size controls",
  capabilities: "Language and data-contract coverage, not a speed ranking",
  limits: "Expected errors and deadlines, never speed wins",
};
export function buildCases({ seed = 1 } = {}) {
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > 1000000) throw new Error("seed must be 1..1000000");
  const cases = [
    ...legacy.map((c,i)=>define({ ...c, suite: i===0 ? "smoke" : "micro", tier: i===0 ? 0 : 1,
      sources: i===0 ? { python: "result = sum(n*n for n in range(1,11) if n%2 == 0)",
        luau: "local sum=0\nfor n=1,10 do if n%2==0 then sum+=n*n end end\nreturn sum" } : {} })),
    ...shortCases(), ...workflowCases(seed), ...apexCases(seed), ...stressCases(seed),
    ...jsonScaleCases(seed), ...sourceCases(), ...boundaryCases(),
  ];
  return cases.map(c => ({ ...c, seed }));
}
export function selectCases(cases, { sets, names, tiers, tags } = {}) {
  for(const [values, known, label] of [[sets,Object.keys(suites),"set"],[names,cases.map(c=>c.name),"case"],[tags,[...new Set(cases.flatMap(c=>c.tags))],"tag"]]) {
    if(values) for(const value of values) if(!known.includes(value)) throw new Error("Unknown " + label + ": " + value);
  }
  const selected = cases.filter(c=>(!sets || sets.includes(c.suite)) && (!names || names.includes(c.name))
    && (!tiers || tiers.includes(c.tier)) && (!tags || tags.some(t=>c.tags.includes(t))));
  if(!selected.length) throw new Error("Selection contains no cases");
  return selected;
}
