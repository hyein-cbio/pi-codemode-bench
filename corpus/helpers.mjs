export const provenance = {
  repository: "https://github.com/hyein-cbio/pi-codemode-bench",
  relationship: "First-party benchmark corpus maintained in this repository; controlled fixtures, not production traffic",
};
export function define(spec) {
  return {
    tier: null, language: "javascript", requires: [], plan: [], expectedOutcome: "success",
    timeoutMs: 10000, tags: [], provenance,
    ...spec,
    sources: { javascript: spec.code, ...spec.sources },
  };
}
export const call = (name, args, value, extra = {}) => ({ name, args, value, ...extra });
export function rows(count, seed = 1, noteSize = 8) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1, active: (i + 1) % 3 !== 0, amount: ((i + 1) * 7 + seed) % 101,
    group: "g" + ((i + 1) % 8), note: String(i + 1).padStart(6, "0") + "x".repeat(noteSize),
  }));
}
export function aggregate(records, passes = 1) {
  // Host oracle uses independent per-group selection, not the guest's one-pass reducer.
  const accepted = records.filter(r => r.active);
  return {
    rows: records.length * passes, accepted: accepted.length * passes,
    total: Number(accepted.reduce((n, r) => n + BigInt(r.amount), 0n)) * passes,
    noteLength: records.reduce((n, r) => n + r.note.length, 0) * passes,
    groups: Array.from({ length: 8 }, (_, i) => {
      const selected = accepted.filter(r => r.group === "g" + i);
      return { key: "g" + i, count: selected.length * passes, total: selected.reduce((n, r) => n + r.amount, 0) * passes };
    }),
  };
}
export const aggregateCode = (rawExpression, passes = 1) => `
const raw = ${rawExpression};
const result = { rows: 0, accepted: 0, total: 0, noteLength: 0, groups: [] };
for (let i = 0; i < 8; i++) result.groups.push({ key: "g" + i, count: 0, total: 0 });
for (let pass = 0; pass < ${passes}; pass++) {
  const records = JSON.parse(raw);
  for (const row of records) {
    result.rows++;
    result.noteLength += row.note.length;
    if (!row.active) continue;
    result.accepted++;
    result.total += row.amount;
    const group = result.groups[Number(row.group.slice(1))];
    group.count++;
    group.total += row.amount;
  }
}
return result;
`;
