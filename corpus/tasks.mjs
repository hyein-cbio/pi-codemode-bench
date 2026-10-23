// Prompts are separate from executable references and expected answers.
export const tasks = [
  { id:"compute", case:"even-squares-10", prompt:"Return the sum of squares of even integers from 1 through 10 inclusive. Do not call tools." },
  { id:"read-reduce", case:"read-reduce", prompt:'Read numbers.txt once using tools.read({path:"numbers.txt"}). Sum the newline-separated signed integers. Return the numeric sum.' },
  { id:"config-summary", case:"config-summary", prompt:'Read package.json once. Parse it and return {name, scripts}, where scripts is a lexically sorted array of script names, not commands.' },
  { id:"parallel-context", case:"parallel-context", prompt:'Concurrently read src/api.ts and src/user.ts once each. Return an array of the number of lines containing TODO in each file, preserving that file order. Both reads must overlap.' },
  { id:"find-then-read", case:"find-then-read", prompt:'Call tools.list({glob:"src/*.ts"}) once. Sort paths lexically, read only the first path, and return {path, todo}, where todo indicates whether its text contains TODO.' },
  { id:"optional-context", case:"optional-context", prompt:'Attempt exactly one read each for src/api.ts, missing.ts, src/user.ts. The missing file is optional: do not retry. Return the Promise.allSettled status strings in that order.' },
  { id:"json-summary", case:"json-records-8k-x1", prompt:'Read data.json exactly once and parse it once. Return {rows, accepted, total, noteLength, groups}. rows counts all records; accepted and total count/sum amount only for active records; noteLength sums note.length over all rows. groups has all eight entries g0..g7 sorted, each {key,count,total} over active records including zero groups.' },
  { id:"context-triage", case:"context-triage", prompt:'Read src/api.ts and src/user.ts once each. For every line containing FIXME (severity 2), otherwise TODO (severity 1), return {path,line,severity} using 1-based line numbers. Sort by severity descending, then path ascending, then line ascending. Return the array only.' },
];
