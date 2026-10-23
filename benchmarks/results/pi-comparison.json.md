# Pi codemode vs. codemode_o: full example

Single-host registered-tool replay. 20 warm samples per eligible cell; 4 warmups and one first-invocation control.

Expected errors and unsupported cells are retained, not performance wins. No aggregate speedup or production ranking.

| Case | Pi codemode median / p95 (ms) | codemode_o median / p95 (ms) |
|---|---:|---:|
| even-squares-10 | 10.158 / 10.803 | 0.561 / 0.803 |
| even-squares-20000 | 10.604 / 11.212 | 66.418 / 77.766 |
| multiples-of-three-5000 | 10.321 / 10.823 | 32.289 / 42.282 |
| even-row-sum-200 | 9.892 / 10.386 | 2.653 / 4.470 |
| string-length-1000 | 9.762 / 10.013 | 1.677 / 2.694 |
| read-reduce | 9.904 / 11.376 | 0.705 / 1.668 |
| config-summary | 10.007 / 10.528 | 0.699 / 1.710 |
| parallel-context | 12.594 / 13.592 | 3.381 / 3.522 |
| optional-context | 9.898 / 10.455 | 0.833 / 1.800 |
| find-then-read | 10.049 / 10.486 | 0.749 / 1.681 |
| context-triage | 9.973 / 10.354 | 1.071 / 1.847 |
| diagnostics-8-wait-0 | 10.296 / 11.597 | 0.718 / 1.683 |
| diagnostics-64-wait-0 | 10.753 / 13.883 | 1.153 / 2.619 |
| diagnostics-256-wait-0 | 10.691 / 11.267 | 2.208 / 3.697 |
| diagnostics-8-wait-20 | 32.644 / 40.905 | 22.956 / 23.902 |
| diagnostics-8-wait-100 | 124.369 / 127.710 | 104.048 / 105.390 |
| cursor-pagination | 10.791 / 13.036 | 1.243 / 2.720 |
| join-topk | 9.955 / 10.240 | 0.904 / 1.031 |
| retry-waves | 18.499 / 20.513 | 9.010 / 9.636 |
| multi-file-etl | 11.119 / 14.098 | 5.002 / 6.231 |
| versioned-reconciliation | 11.603 / 12.920 | 4.572 / 5.252 |
| fan-in-dag-64 | 21.785 / 24.801 | 12.998 / 14.053 |
| deep-roundtrip-64 | 15.870 / 16.301 | 7.264 / 7.659 |
| arithmetic-100000 | 12.807 / 13.660 | 203.832 / 212.545 |
| arithmetic-1000000 | 36.200 / 37.381 | 2010.164 / 2048.270 |
| matrix-12 | 9.628 / 9.847 | 7.082 / 7.257 |
| matrix-32 | 10.976 / 11.531 | 111.861 / 121.793 |
| stable-sort-2000 | 10.978 / 11.401 | 116.008 / 124.630 |
| graph-bfs-256 | 9.926 / 10.545 | 11.278 / 11.730 |
| allocation-churn | 11.024 / 11.426 | 47.741 / 59.057 |
| bridge-128-width-1 | 16.382 / 20.681 | Unsupported: tool-call-budget:128>64 |
| bridge-128-width-32 | 22.062 / 22.944 | Unsupported: tool-call-budget:128>64 |
| json-records-2k-x1 | 9.942 / 10.973 | 1.359 / 2.229 |
| json-records-2k-x4 | 10.039 / 10.552 | 3.032 / 4.145 |
| json-records-2k-x16 | 10.529 / 10.923 | 10.698 / 11.163 |
| json-records-8k-x1 | 10.111 / 11.203 | 2.904 / 3.988 |
| json-records-8k-x4 | 10.435 / 10.930 | 10.378 / 11.586 |
| json-records-8k-x16 | 11.533 / 11.846 | 38.921 / 48.713 |
| json-records-16k-x1 | 10.060 / 10.385 | 5.824 / 6.428 |
| json-records-16k-x4 | 10.740 / 11.281 | 19.895 / 23.779 |
| json-records-16k-x16 | 13.221 / 14.430 | 78.061 / 91.633 |
| json-records-24k-x1 | 10.397 / 10.742 | 8.230 / 8.960 |
| json-records-24k-x4 | 11.293 / 11.863 | 29.365 / 34.908 |
| json-records-24k-x16 | 14.720 / 18.180 | 119.062 / 128.861 |
| json-records-32k-x1 | 10.664 / 11.110 | 10.464 / 12.512 |
| json-records-32k-x4 | 11.702 / 12.197 | 38.644 / 43.001 |
| json-records-32k-x16 | 16.283 / 18.028 | 158.496 / 167.272 |
| json-records-48k-x1 | 10.884 / 11.359 | 15.266 / 17.834 |
| json-records-48k-x4 | 12.636 / 13.463 | 57.266 / 68.005 |
| json-records-48k-x16 | 19.361 / 21.687 | 236.450 / 257.985 |
| json-strings-2k-x1 | 9.825 / 10.447 | 0.732 / 0.826 |
| json-strings-2k-x4 | 9.867 / 10.218 | 0.970 / 1.851 |
| json-strings-2k-x16 | 9.898 / 10.091 | 1.802 / 2.707 |
| json-strings-8k-x1 | 9.833 / 10.671 | 1.013 / 1.131 |
| json-strings-8k-x4 | 9.897 / 10.477 | 1.922 / 3.017 |
| json-strings-8k-x16 | 10.440 / 10.986 | 6.329 / 6.674 |
| json-strings-16k-x1 | 9.926 / 10.223 | 1.292 / 2.279 |
| json-strings-16k-x4 | 10.165 / 10.871 | 3.129 / 4.379 |
| json-strings-16k-x16 | 10.886 / 11.658 | 10.903 / 12.406 |
| json-strings-24k-x1 | 9.921 / 10.202 | 1.550 / 2.450 |
| json-strings-24k-x4 | 10.142 / 10.961 | 4.381 / 6.510 |
| json-strings-24k-x16 | 10.862 / 11.346 | 15.499 / 16.630 |
| json-strings-32k-x1 | 10.031 / 11.124 | 1.913 / 3.554 |
| json-strings-32k-x4 | 10.221 / 10.440 | 6.064 / 6.435 |
| json-strings-32k-x16 | 11.118 / 12.023 | 20.276 / 23.724 |
| json-strings-48k-x1 | 10.218 / 10.521 | 2.493 / 3.648 |
| json-strings-48k-x4 | 10.698 / 10.901 | 8.573 / 11.366 |
| json-strings-48k-x16 | 11.689 / 12.232 | 30.137 / 40.101 |
| source-128 | 9.398 / 9.967 | 0.326 / 0.359 |
| source-4096 | 9.655 / 10.917 | 0.759 / 2.103 |
| source-32768 | 16.753 / 18.683 | 5.778 / 8.226 |
| explicit-error | Expected-error check; not timed for comparison | Expected-error check; not timed for comparison |
| deadline-loop | Expected-error check; not timed for comparison | Unsupported: missing-capabilities:per-call-deadline |
| json-depth-40 | 9.318 / 10.020 | Unsupported: missing-capabilities:deep-json |
| class-method | 9.329 / 9.677 | Unsupported: missing-capabilities:classes |
| unicode-json | 9.538 / 10.381 | 0.365 / 0.432 |
