export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface FixtureCall { name: string; args: Json; value: Json; error?: string; after?: number[]; waitMs?: number }
export interface Fixture {
  readonly names: string[];
  readonly trace: readonly FixtureTrace[];
  readonly peak: number;
  call(name: string, args: Json, signal?: AbortSignal): Promise<Json>;
  validate(concurrency?: { minPeak?: number; maxPeak?: number }): string[];
}
export interface ExecutionContext { fixture: Fixture; timeoutMs: number; signal?: AbortSignal }
export interface ToolResult {
  ok: boolean; value?: Json; error?: string; transportError?: boolean;
  truncated?: boolean; warnings?: string[];
}
export interface ToolClient {
  implementationFiles?: string[];
  version?: string | null;
  lifecycle?: string;
  callTool(name: string, input: { [key: string]: Json }, context: ExecutionContext): Promise<ToolResult>;
  dispose?(): void | Promise<void>;
}
export interface RuntimeAdapter {
  name: string; language: string; capabilities: string[]; version?: string | null; lifecycle?: string;
  execute(code: string, context: ExecutionContext): Promise<ToolResult & { ms: number }>;
  dispose?(): void | Promise<void>;
}
export interface ClientFactoryOptions { options: { [key: string]: Json }; toolName: string }
export interface RuntimeFactoryOptions { options: { [key: string]: Json } }
export interface SourcePlugin {
  language: string;
  sources: Record<string, string>;
  comment?: { prefix: string; suffix?: string };
}
export interface SourceContext { seed: number; caseNames: readonly string[] }
export type SourceFactory = (context: SourceContext) => SourcePlugin | Promise<SourcePlugin>;
export type ToolClientFactory = (context: ClientFactoryOptions) => ToolClient | Promise<ToolClient>;
export type RuntimeAdapterFactory = (context: RuntimeFactoryOptions) => RuntimeAdapter | Promise<RuntimeAdapter>;
export interface ToolTarget {
  id?: string; kind: "tool"; tool: string; adapter: string; language?: string; capabilities?: string[];
  inputKey?: string; input?: { [key: string]: Json }; options?: { [key: string]: Json }; maxToolCalls?: number;
}
export type RuntimeTarget = { id?: string; kind: "runtime"; engine: "pi" | "opencode" | "node" }
  | { id: string; kind: "runtime"; adapter: string; options?: { [key: string]: Json } };
export interface PiToolTarget {
  id?: string; kind: "pi-tool"; tool: string; extensions?: string[]; sdk?: string; language?: string;
  capabilities?: string[]; inputKey?: string; input?: { [key: string]: Json }; maxToolCalls?: number;
  resultFormat?: "json-text" | "pi-codemode" | "structured"; sourceOptions?: boolean;
}
export interface BenchmarkConfig { version: 1; targets: (ToolTarget | RuntimeTarget | PiToolTarget)[]; sources?: string[] }
export interface BenchmarkCase {
  name: string; suite: string; tier: number | null; seed: number; code: string; sources: Record<string, string>;
  expectedOutcome: "success" | "error"; expected?: Json; errorPattern?: string;
  requires: string[]; plan: FixtureCall[]; timeoutMs: number; tags: string[];
}
export interface CoverageReport {
  mode: "check"; ok: boolean;
  targets: { id: string; language: string; eligible: number; unsupported: { case: string; reason: string }[] }[];
}
export interface FixtureTrace {
  name: string; args: Json; planIndex: number; status: "pending" | "denied" | "cancelled" | "ok" | "error";
  error?: string; ms?: number; replyHash?: string; replyBytes?: number;
}
export interface EngineMetadata {
  name: string; kind: string; language: string; capabilities: string[]; version: string | null;
  toolName: string | null; lifecycle: string; clock: string; maxToolCalls: number | null;
  extensionHashes?: Record<string, string>;
  extensionSources?: Record<string, {
    revision: string | null; status: string | null; packageSha256: string | null; lockSha256: string | null;
  }>;
}
export interface BenchmarkRow {
  case: string; engine: string; phase: "cold" | "warmup" | "warm" | "eligibility";
  status: "success" | "invalid" | "expected-error" | "unsupported"; valid: boolean; ms: number | null;
  reasons?: string[]; reason?: string; trace?: FixtureTrace[]; peak?: number | null; value?: Json;
}
export interface CellSummary {
  n: number; medianMs: number | null; p95Ms: number | null; minMs: number | null; maxMs: number | null;
  invalid: number; unsupported: string | null; eligibleForTiming: boolean;
}
export interface CaseSummary { name: string; suite: string; engines: Record<string, CellSummary> }
export interface BenchmarkReceipt {
  format: 2; complete: true; sourceDrift: boolean; createdAt: string;
  benchmark: { name: string; version: string };
  git: { head: string | null; status: string | null };
  sourceConfig: { files: { file: string; sha256: string; language: string; cases: string[] }[];
    comments: Record<string, { prefix: string; suffix: string }> };
  counts: { executions: number; invalid: number; unsupported: number; expectedErrors: number };
  config: Record<string, unknown>; engines: EngineMetadata[]; cases: CaseSummary[];
  rows: BenchmarkRow[]; implementationHashes: Record<string, string | null>;
}
export function runBenchmark(argv?: string[], options?: {
  log?: (text: string) => void; signal?: AbortSignal;
}): Promise<BenchmarkReceipt | CoverageReport | undefined>;
export function buildCases(options?: { seed?: number }): BenchmarkCase[];
export function createFixture(plan?: FixtureCall[]): Fixture;
export function createJsonlClient(options: {
  command: string; args?: string[]; maxRecordBytes?: number;
}): Promise<ToolClient>;
