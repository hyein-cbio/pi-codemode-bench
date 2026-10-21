// Shared JavaScript programs. Both clocks run this source. Expected values are the parity check.
export const cases = [
  {
    name: "even-squares-10",
    kind: "short-loop",
    expected: 220,
    code: "let sum = 0\nfor (let n = 1; n <= 10; n++) {\n  if (n % 2 === 0) sum += n * n\n}\nreturn sum\n",
  },
  {
    name: "even-squares-20000",
    kind: "long-loop",
    expected: 1333533340000,
    code: "let sum = 0\nfor (let n = 1; n <= 20000; n++) {\n  if (n % 2 === 0) sum += n * n\n}\nreturn sum\n",
  },
  {
    name: "multiples-of-three-5000",
    kind: "array-scan",
    expected: 4165833,
    code: "const items = []\nfor (let n = 1; n <= 5000; n++) items.push(n)\nlet total = 0\nfor (const n of items) if (n % 3 === 0) total += n\nreturn total\n",
  },
  {
    name: "even-row-sum-200",
    kind: "object-filter",
    expected: 10100,
    code: "const rows = []\nfor (let n = 1; n <= 200; n++) rows.push({ n, ok: n % 2 === 0 })\nreturn rows.filter((row) => row.ok).reduce((sum, row) => sum + row.n, 0)\n",
  },
  {
    name: "string-length-1000",
    kind: "string-build",
    expected: 1000,
    code: "let text = \"\"\nfor (let i = 0; i < 1000; i++) text += \"a\"\nreturn text.length\n",
  },
];
