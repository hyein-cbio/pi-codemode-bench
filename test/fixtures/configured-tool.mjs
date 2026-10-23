// Test-only extension: proves arbitrary registered tool names/input keys use the
// real Pi pipeline. Never use this unrestricted host evaluator for untrusted code.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
export default function (pi) {
  pi.registerTool({
    name: "configured_script", label: "Test script", description: "Offline test only",
    parameters: { type: "object", properties: { program: { type: "string" }, marker: { type: "string" } },
      required: ["program", "marker"], additionalProperties: false },
    async execute(_id, args, signal, _update, ctx) {
      if (args.marker === "malformed") return { content: [{ type: "text", text: "BENCH_EXPECTED" }] };
      if (!["config-input", "structured"].includes(args.marker)) throw new Error("Configured input was not forwarded");
      const tools = Object.fromEntries(ctx.tools.filter(t => t.name !== "configured_script").map(t => [t.name, async input => {
        const result = await ctx.executeTool(t.name, input, { signal });
        if (result.isError) throw new Error(result.result.content.map(b => b.text ?? "").join("\n"));
        return result.result.structuredContent;
      }]));
      const value = await new AsyncFunction("tools", args.program)(tools);
      return args.marker === "structured"
        ? { content: [], structuredContent: value, details: { registered: true } }
        : { content: [{ type: "text", text: JSON.stringify(value) }], details: { registered: true } };
    },
  });
}
