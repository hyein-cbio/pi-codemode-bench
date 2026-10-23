// Programs only: the shared fixture plans and independent oracles are unchanged.
export function createSources() {
  return {
    language: "python",
    comment: { prefix: "#" },
    sources: {
      "even-squares-10": "return sum(n*n for n in range(1, 11) if n % 2 == 0)",
      "read-reduce": 'raw = await tools.read({"path": "numbers.txt"})\nreturn sum(int(n) for n in raw.split())',
      "parallel-context": 'texts = await asyncio.gather(tools.read({"path": "src/api.ts"}), tools.read({"path": "src/user.ts"}))\nreturn [sum("TODO" in line for line in text.splitlines()) for text in texts]',
      "optional-context": 'results = await asyncio.gather(*(tools.read({"path": path}) for path in ["src/api.ts", "missing.ts", "src/user.ts"]), return_exceptions=True)\nreturn ["rejected" if isinstance(value, Exception) else "fulfilled" for value in results]',
      "explicit-error": 'raise RuntimeError("BENCH_EXPECTED")',
      "deadline-loop": "while True:\n    pass",
    },
  };
}
