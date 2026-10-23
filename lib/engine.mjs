import { Worker } from "node:worker_threads";

// One serial client per worker. Cooperative close has a bounded grace period;
// synchronous hangs still require hard termination and always invalidate samples.
export class Engine {
  constructor(spec) { this.spec = spec; this.sequence = 0; this.worker = null; this.metadata = null; this.busy = false; }
  async start() {
    if (this.worker) return;
    const sourceComment = this.metadata?.sourceComment;
    const worker = new Worker(new URL("./worker.mjs", import.meta.url), { workerData: this.spec });
    this.worker = worker;
    try {
      this.metadata = await new Promise((resolve, reject) => {
        const done = (error, value) => {
          clearTimeout(timer); worker.off("message", onMessage); worker.off("error", onError); worker.off("exit", onExit);
          error ? reject(error) : resolve(value);
        };
        const timer = setTimeout(() => done(new Error("Adapter initialization timeout")), 30000);
        const onMessage = msg => { if (msg.type === "ready") done(null, msg.metadata); else if (msg.type === "fatal") done(new Error(msg.error)); };
        const onError = error => done(error), onExit = code => done(new Error("Adapter exited during initialization: " + code));
        worker.on("message", onMessage); worker.once("error", onError); worker.once("exit", onExit);
      });
    } catch (error) { await worker.terminate(); this.worker = null; throw error; }
    if (sourceComment) this.metadata.sourceComment = sourceComment;
    worker.on("error", () => { if (this.worker === worker) this.worker = null; });
    worker.on("exit", () => { if (this.worker === worker) this.worker = null; });
  }
  async stop(worker) {
    if (this.worker === worker) this.worker = null;
    try {
      await new Promise((resolve, reject) => {
        const done = error => {
          clearTimeout(timer); worker.off("message", onMessage); worker.off("error", done); worker.off("exit", onExit);
          error ? reject(error) : resolve();
        };
        const timer = setTimeout(() => done(new Error("Adapter disposal timeout")), 1000);
        const onMessage = msg => { if (msg.type === "closed") done(msg.error ? new Error(msg.error) : null); };
        const onExit = () => done();
        worker.on("message", onMessage); worker.once("error", done); worker.once("exit", onExit);
        worker.postMessage({ type: "close" });
      });
    } finally { await worker.terminate(); }
  }
  async run(item, code, { signal } = {}) {
    if (this.busy) throw new Error("Engine requests must be serial");
    this.busy = true;
    try {
      try { await this.start(); }
      catch (error) { return { valid: false, status: "invalid", reasons: ["adapter-init"], error: error.message, ms: null, trace: [], peak: 0 }; }
      const worker = this.worker, id = ++this.sequence;
      return await new Promise(resolve => {
        let settled = false;
        const failure = (reason, error) => ({ valid: false, status: "invalid", reasons: [reason], error, ms: null, trace: [], peak: null, traceComplete: false });
        const finish = async (result, kill = false) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer); signal?.removeEventListener("abort", onAbort);
          worker.off("message", onMessage); worker.off("error", onError); worker.off("exit", onExit);
          if (kill) {
            try { await this.stop(worker); } catch (error) { result.cleanupError = error.message; }
          }
          resolve(result);
        };
        const timer = setTimeout(() => finish(failure("watchdog-timeout", "Host watchdog exceeded runtime deadline + 2000ms"), true), item.timeoutMs + 2000);
        const onAbort = () => finish(failure("caller-aborted", "Benchmark caller aborted"), true);
        const onMessage = msg => { if (msg.id === id && msg.type === "result") void finish(msg.result); };
        const onError = error => { void finish(failure("worker-crash", error.message), true); };
        const onExit = code => { void finish(failure("worker-exit", "Worker exit " + code)); };
        worker.on("message", onMessage); worker.once("error", onError); worker.once("exit", onExit);
        signal?.addEventListener("abort", onAbort, { once: true });
        if (signal?.aborted) onAbort();
        else worker.postMessage({ type: "run", id, item, code });
      });
    } finally { this.busy = false; }
  }
  async close() { if (this.worker) await this.stop(this.worker); }
}
