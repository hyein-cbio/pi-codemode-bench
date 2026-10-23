import { spawn } from "node:child_process";

// Optional dependency-free JSONL transport for a trusted local interpreter.
// A backend is reused until failure/deadline; after termination the next call
// starts a fresh backend. This is a protocol bridge, NOT an OS sandbox.
export async function createJsonlClient({ command, args = [], maxRecordBytes = 1024 * 1024 }) {
  if (!Number.isSafeInteger(maxRecordBytes) || maxRecordBytes < 1) throw new Error("maxRecordBytes must be a positive safe integer");
  let backend, sequence = 0, disposed = false, version;
  async function stop(state) {
    if (backend === state) backend = null;
    if (state.child.exitCode !== null || state.child.signalCode !== null) return;
    state.child.kill("SIGTERM");
    const timer = setTimeout(() => state.child.kill("SIGKILL"), 200);
    try { await state.exited; } finally { clearTimeout(timer); }
  }
  async function start() {
    if (disposed) throw new Error("JSONL client is disposed");
    if (backend) return backend;
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const state = { child, active: null, buffer: "", stderr: "", failed: false };
    backend = state;
    state.exited = new Promise(resolve => child.once("close", resolve));
    let readyResolve, readyReject;
    const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    const fail = error => {
      if (state.failed) return;
      state.failed = true; state.buffer = "";
      readyReject(error);
      if (state.active) void state.active.finish({ ok: false, transportError: true, error: error.message }, true);
      else void stop(state);
    };
    const send = message => {
      if (state.failed || child.stdin.destroyed) throw new Error("JSONL backend input is closed");
      const line = JSON.stringify(message) + "\n";
      if (Buffer.byteLength(line) > maxRecordBytes) throw new Error("JSONL request exceeds record budget");
      child.stdin.write(line, error => { if (error) fail(error); });
    };
    state.send = send;
    child.stdin.on("error", fail); child.on("error", fail);
    child.on("close", () => fail(new Error("JSONL backend exited: " + state.stderr.slice(-2000))));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", text => { state.stderr = (state.stderr + text).slice(-8192); });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      if (state.failed) return;
      try {
        state.buffer += chunk;
        let end;
        while ((end = state.buffer.indexOf("\n")) !== -1) {
          const line = state.buffer.slice(0, end); state.buffer = state.buffer.slice(end + 1);
          if (Buffer.byteLength(line) > maxRecordBytes) throw new Error("JSONL response exceeds record budget");
          const message = JSON.parse(line), active = state.active;
          if (message.type === "ready") {
            if (state.ready || typeof message.version !== "string") throw new Error("Invalid JSONL ready message");
            state.ready = true; readyResolve(message.version); continue;
          }
          if (!active || active.finished || message.executionId !== active.id) throw new Error("Unexpected JSONL execution id");
          if (message.type === "tool") {
            if (typeof message.id !== "string" || active.ids.has(message.id) || typeof message.name !== "string") throw new Error("Invalid JSONL tool request");
            active.ids.add(message.id);
            const work = (async () => {
              let reply;
              try { reply = { ok: true, value: await active.fixture.call(message.name, message.args, active.controller.signal) }; }
              catch (error) { reply = { ok: false, error: error.message }; }
              if (!active.finished) send({ type: "tool-result", executionId: active.id, id: message.id, ...reply });
            })();
            active.pending.add(work);
            void work.catch(fail).finally(() => active.pending.delete(work));
          } else if (message.type === "result" && typeof message.ok === "boolean") {
            void active.finish(message, active.pending.size > 0);
          } else throw new Error("Invalid JSONL response type");
        }
        if (Buffer.byteLength(state.buffer) > maxRecordBytes) throw new Error("JSONL response exceeds record budget");
      } catch (error) { fail(error); }
    });
    const timer = setTimeout(() => fail(new Error("JSONL backend startup timeout")), 5000);
    try {
      const observed = await ready;
      if (version !== undefined && version !== observed) throw new Error("JSONL backend version changed on restart");
      version = observed; return state;
    } catch (error) { await stop(state); throw error; }
    finally { clearTimeout(timer); }
  }
  await start();
  return {
    version,
    lifecycle: "Reusable trusted JSONL subprocess; startup excluded initially, restart after a deadline/failure included in that call",
    async callTool(name, input, { fixture, timeoutMs, signal }) {
      const state = await start();
      if (state.active) throw new Error("JSONL calls must be serial");
      return new Promise(resolve => {
        const controller = new AbortController();
        const active = { id: ++sequence, fixture, controller, ids: new Set(), pending: new Set(), finished: false };
        state.active = active;
        const finish = async (result, kill = false) => {
          if (active.finished) return;
          active.finished = true;
          clearTimeout(timer); signal?.removeEventListener("abort", onAbort);
          if (active.pending.size && !result.transportError) result = { ok: false, transportError: true, error: "Backend returned with unfinished fixture calls" };
          controller.abort(new Error("JSONL invocation finished"));
          if (kill) await stop(state);
          await Promise.allSettled([...active.pending]);
          state.active = null;
          resolve({ ok: result.ok, value: result.value, error: result.error,
            transportError: result.transportError, warnings: result.warnings, truncated: result.truncated });
        };
        active.finish = finish;
        // This helper owns its backend deadline. A host abort is a distinct,
        // invalid adapter cancellation, never an expected guest timeout pass.
        const timer = setTimeout(() => { void finish({ ok: false, error: "Runtime deadline exceeded" }, true); }, timeoutMs);
        const onAbort = () => { void finish({ ok: false, transportError: true, error: "JSONL caller aborted" }, true); };
        signal?.addEventListener("abort", onAbort, { once: true });
        if (signal?.aborted) onAbort();
        else {
          try { state.send({ type: "execute", executionId: active.id, name, input, tools: [...fixture.names] }); }
          catch (error) { void finish({ ok: false, transportError: true, error: error.message }, true); }
        }
      });
    },
    async dispose() {
      disposed = true;
      const state = backend;
      if (!state) return;
      if (state.active && !state.active.finished) await state.active.finish({ ok: false, transportError: true, error: "JSONL client disposed" }, true);
      else await stop(state);
    },
  };
}
