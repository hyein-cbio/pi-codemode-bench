export const help = `Usage: node bench.mjs [options]
  --sets=smoke,micro,short,workflow | all   Default: these four sets
  --cases=name,name  --tiers=0,1,...,5  --tags=json,parallel
  --engines=pi,opencode,node | none        Explicit direct-runtime controls; no default targets
  --adapter=./module.mjs                   Add a trusted ESM adapter
  --config=./bench.config.json            Explicit JSON targets (replaces --engines/--adapter)
  --targets=target-a,target-b             Select arbitrary target IDs from --config
  --list-targets                          Print resolved targets, without loading extensions
  --sources=./sources.mjs                 Add a trusted source plugin (repeatable)
  --check                                 Check target/corpus coverage without executing programs
  --warmup=4 --samples=20 --seed=1
  --source-mode=reused|fresh               Fresh adds a unique comment per invocation
  --list                                  List selected cases without execution
  --export=path.json                       Export sources, fixtures and oracles, no execution
  --out=results/run.json                   New receipt path; refuses overwrite
  --strict-coverage                       Exit nonzero for unsupported cases
  --help
Stress, JSON sweeps, capability probes and deadline tests are opt-in.
Built-in fixtures use no model requests or personal configuration.
Explicit --config extensions run as trusted host code; review them before loading.`;

export function readConfig(argv) {
  const config = { warmup: 4, samples: 20, seed: 1, sets: null, engines: [], adapters: [], sources: [], sourceMode: "reused" };
  const seen = new Set();
  const lists = new Set(["sets", "cases", "tiers", "tags", "engines", "targets"]);
  for (const arg of argv) {
    if (["--list", "--list-targets", "--strict-coverage", "--help", "--check"].includes(arg)) {
      config[arg.slice(2)] = true; continue;
    }
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    if (!match) throw new Error("Invalid option: " + arg + "\n" + help);
    const [, key, value] = match;
    if (!["adapter", "sources"].includes(key) && seen.has(key)) throw new Error("Repeated option: " + key);
    seen.add(key);
    if (["warmup", "samples", "seed"].includes(key)) {
      if (!/^\d+$/.test(value)) throw new Error("Invalid " + key);
      config[key] = Number(value);
    } else if (lists.has(key)) {
      const values = value.split(",");
      if (values.some(v => !v) || new Set(values).size !== values.length) throw new Error("Empty or duplicate " + key);
      config[key === "cases" ? "names" : key] = values;
    } else if (key === "adapter") config.adapters.push(value);
    else if (key === "sources") config.sources.push(value);
    else if (key === "source-mode") config.sourceMode = value;
    else if (key === "config") config.configFile = value;
    else if (["out", "export"].includes(key)) config[key] = value;
    else throw new Error("Unknown option: " + key);
  }
  for (const key of ["warmup", "samples", "seed"]) {
    if (!Number.isSafeInteger(config[key]) || config[key] < (key === "warmup" ? 0 : 1) || config[key] > (key === "seed" ? 1000000 : 10000)) throw new Error("Invalid " + key);
  }
  if (!["fresh", "reused"].includes(config.sourceMode)) throw new Error("Invalid source-mode");
  if (config.tiers) {
    if (config.tiers.some(t => !/^[0-5]$/.test(t))) throw new Error("tiers must be 0..5");
    config.tiers = config.tiers.map(Number);
  }
  if (config.configFile) {
    if (seen.has("engines") || config.adapters.length) throw new Error("--config cannot be mixed with --engines/--adapter");
    config.engines = [];
  }
  if ((config.targets || config["list-targets"]) && !config.configFile) throw new Error("--targets/--list-targets require --config");
  if (config["list-targets"] && (config.list || config.export)) throw new Error("Choose --list-targets, --list or --export");
  if (config.engines.length === 1 && config.engines[0] === "none") config.engines = [];
  if (config.engines.some(e => !["pi", "opencode", "node"].includes(e))) throw new Error("Unknown engine");
  if (seen.has("engines") && !config.engines.length && !config.adapters.length) throw new Error("At least one engine or adapter is required");
  if (config.sets?.includes("all")) {
    if (config.sets.length !== 1) throw new Error("all cannot be mixed with named sets");
    config.sets = null;
  } else if (!config.sets && !config.names && !config.tiers && !config.tags) config.sets = ["smoke", "micro", "short", "workflow"];
  if (config.check && (config.list || config.export || config["list-targets"])) throw new Error("Choose --check, --list-targets, --list or --export");
  if (config.list && config.export) throw new Error("Choose --list or --export");
  return config;
}
