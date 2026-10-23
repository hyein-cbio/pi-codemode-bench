# Pi codemode vs. codemode_o: full example

Single-host registered-tool replay. 20 warm samples per eligible cell; 4 warmups and one first-invocation control.

Expected errors and unsupported cells are retained, not performance wins. No aggregate speedup or production ranking.

| Case | Pi codemode median / p95 (ms) | codemode_o median / p95 (ms) |
|---|---:|---:|
| even-squares-10 | 13.820 / 14.774 | 0.602 / 0.745 |
| even-squares-20000 | 13.032 / 13.743 | 66.376 / 76.985 |
| multiples-of-three-5000 | 12.348 / 12.551 | 31.891 / 41.416 |
| even-row-sum-200 | 12.278 / 13.062 | 2.682 / 4.354 |
| string-length-1000 | 13.157 / 14.581 | 1.736 / 3.085 |
| read-reduce | 12.244 / 12.886 | 0.738 / 1.661 |
| config-summary | 12.687 / 15.094 | 0.713 / 1.510 |
| parallel-context | 15.243 / 18.113 | 3.210 / 3.734 |
| optional-context | 12.460 / 12.745 | 0.878 / 1.905 |
| find-then-read | 12.588 / 13.354 | 0.789 / 1.716 |
| context-triage | 12.401 / 13.320 | 1.052 / 1.905 |
| diagnostics-8-wait-0 | 12.489 / 13.518 | 0.691 / 1.699 |
| diagnostics-64-wait-0 | 12.498 / 14.145 | 1.170 / 2.214 |
| diagnostics-256-wait-0 | 12.849 / 13.859 | 2.379 / 3.735 |
| diagnostics-8-wait-20 | 34.107 / 37.925 | 21.912 / 22.053 |
| diagnostics-8-wait-100 | 124.675 / 130.399 | 103.295 / 104.055 |
| cursor-pagination | 12.950 / 14.201 | 1.252 / 1.450 |
| join-topk | 12.828 / 14.225 | 0.977 / 1.831 |
| retry-waves | 20.106 / 20.519 | 8.857 / 9.270 |
| multi-file-etl | 13.109 / 14.495 | 5.086 / 6.515 |
| versioned-reconciliation | 13.820 / 15.766 | 4.264 / 5.415 |
| fan-in-dag-64 | 23.789 / 25.372 | 13.023 / 14.313 |
| deep-roundtrip-64 | 18.095 / 18.984 | 7.224 / 8.971 |
| arithmetic-100000 | 15.961 / 16.942 | 211.648 / 226.553 |
| arithmetic-1000000 | 39.600 / 44.471 | 2131.157 / 2279.885 |
| matrix-12 | 14.101 / 20.364 | 7.802 / 9.496 |
| matrix-32 | 13.495 / 14.912 | 113.287 / 124.310 |
| stable-sort-2000 | 15.282 / 21.472 | 138.062 / 159.654 |
| graph-bfs-256 | 13.603 / 14.727 | 12.080 / 13.828 |
| allocation-churn | 14.832 / 16.832 | 52.382 / 63.596 |
| bridge-128-width-1 | 20.287 / 21.283 | Unsupported: tool-call-budget:128>64 |
| bridge-128-width-32 | 27.504 / 30.603 | Unsupported: tool-call-budget:128>64 |
| json-records-2k-x1 | 13.307 / 14.195 | 1.519 / 2.549 |
| json-records-2k-x4 | 15.055 / 17.319 | 4.347 / 4.926 |
| json-records-2k-x16 | 17.998 / 21.854 | 13.377 / 20.662 |
| json-records-8k-x1 | 15.369 / 16.366 | 3.984 / 5.911 |
| json-records-8k-x4 | 13.405 / 14.384 | 10.526 / 14.814 |
| json-records-8k-x16 | 14.205 / 16.035 | 40.849 / 53.587 |
| json-records-16k-x1 | 13.714 / 14.212 | 6.107 / 6.789 |
| json-records-16k-x4 | 14.479 / 17.752 | 21.165 / 24.008 |
| json-records-16k-x16 | 15.662 / 18.408 | 78.320 / 90.483 |
| json-records-24k-x1 | 12.870 / 14.205 | 8.293 / 9.038 |
| json-records-24k-x4 | 13.645 / 14.307 | 29.446 / 40.286 |
| json-records-24k-x16 | 18.366 / 20.821 | 125.142 / 143.389 |
| json-records-32k-x1 | 13.246 / 13.925 | 10.397 / 11.015 |
| json-records-32k-x4 | 15.117 / 15.990 | 40.434 / 49.751 |
| json-records-32k-x16 | 23.192 / 32.107 | 187.881 / 214.745 |
| json-records-48k-x1 | 14.779 / 16.037 | 16.580 / 20.351 |
| json-records-48k-x4 | 16.886 / 20.082 | 65.787 / 77.543 |
| json-records-48k-x16 | 24.991 / 30.588 | 254.284 / 308.080 |
| json-strings-2k-x1 | 14.065 / 18.938 | 0.921 / 1.248 |
| json-strings-2k-x4 | 13.806 / 15.731 | 1.208 / 2.607 |
| json-strings-2k-x16 | 15.835 / 17.609 | 2.307 / 4.479 |
| json-strings-8k-x1 | 15.845 / 21.648 | 1.336 / 2.021 |
| json-strings-8k-x4 | 14.631 / 15.574 | 2.158 / 3.655 |
| json-strings-8k-x16 | 15.453 / 17.328 | 7.119 / 7.732 |
| json-strings-16k-x1 | 15.753 / 16.923 | 1.670 / 2.917 |
| json-strings-16k-x4 | 15.953 / 35.282 | 4.260 / 5.511 |
| json-strings-16k-x16 | 15.028 / 18.501 | 12.452 / 16.715 |
| json-strings-24k-x1 | 13.560 / 14.634 | 1.787 / 2.904 |
| json-strings-24k-x4 | 13.056 / 14.313 | 4.795 / 5.460 |
| json-strings-24k-x16 | 15.658 / 17.521 | 17.770 / 21.588 |
| json-strings-32k-x1 | 12.736 / 13.270 | 1.878 / 2.898 |
| json-strings-32k-x4 | 12.747 / 13.100 | 6.090 / 6.283 |
| json-strings-32k-x16 | 13.819 / 14.367 | 20.355 / 30.987 |
| json-strings-48k-x1 | 13.422 / 14.844 | 2.841 / 3.904 |
| json-strings-48k-x4 | 13.649 / 15.814 | 8.834 / 9.970 |
| json-strings-48k-x16 | 20.908 / 29.577 | 44.851 / 66.778 |
| source-128 | 13.940 / 15.635 | 0.392 / 0.487 |
| source-4096 | 12.693 / 13.679 | 0.803 / 1.815 |
| source-32768 | 21.617 / 25.155 | 6.501 / 8.351 |
| explicit-error | Expected-error check; not timed for comparison | Expected-error check; not timed for comparison |
| deadline-loop | Expected-error check; not timed for comparison | Unsupported: missing-capabilities:per-call-deadline |
| json-depth-40 | 12.649 / 15.656 | Unsupported: missing-capabilities:deep-json |
| class-method | 13.440 / 17.634 | Unsupported: missing-capabilities:classes |
| unicode-json | 13.724 / 15.527 | 0.445 / 0.594 |
