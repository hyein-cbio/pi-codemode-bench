// Dependency-free protocol demonstration, NOT a product or secure sandbox.
// This client owns one local code-execution tool named run_script.
import { openNodeVm } from "../adapters/node-vm.mjs";

export function createToolClient() {
  const runtime = openNodeVm();
  return {
    version: process.version,
    lifecycle: "Local demo tool registry; fresh trusted Node VM per call; no external service",
    async callTool(name, input, { fixture, timeoutMs }) {
      if (name !== "run_script") throw new Error("Unknown demo tool: " + name);
      if (typeof input.code !== "string") throw new Error("run_script requires code");
      return runtime.execute(input.code, { fixture, timeoutMs });
    },
  };
}
