# pi-codemode-bench

속도 측정용 케이스와 측정 절차입니다. Pi QuickJS `codemode`와 OpenCode `codemode_o`가 같은 JavaScript를 실행합니다. 실사용 세션의 작성 시간 기록은 여기 없습니다.

```sh
npm install
npm test
npm run bench:smoke
npm run bench
```

`npm run bench`는 warmup 4, warm sample 20입니다. 케이스 하나의 첫 실행은 cold로만 남고 median/p95에는 들어가지 않습니다. 같은 sample index에서는 두 엔진을 모두 재고, 시작 엔진은 index마다 바뀝니다. 시계는 `execute` 한 번을 감싼 `performance.now()`입니다.

Pi는 호출마다 새 QuickJS sandbox를 시작합니다. OpenCode는 runtime 하나를 재사용하고 parse와 tree-walk가 시계 안에 있습니다. 두 median을 나누지 않습니다. 값이 같다는 것은 이 케이스들의 결과 일치이며, 언어 전반의 parity나 VM 속도가 아닙니다.

결과는 `results/latest.json`입니다.
