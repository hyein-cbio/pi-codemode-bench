"""Trusted-code JSONL backend demonstration; not a sandbox."""
import asyncio
import json
import platform
import sys
import textwrap
import threading

output_lock = threading.Lock()
pending_lock = threading.Lock()
pending = {}
busy = False


def send(message):
    with output_lock:
        print(json.dumps(message, allow_nan=False), flush=True)


def execute(message):
    global busy
    execution_id = message["executionId"]
    sequence = 0

    class Tools:
        def __getattr__(self, name):
            async def call(args):
                nonlocal sequence
                sequence += 1
                request_id = str(sequence)
                loop = asyncio.get_running_loop()
                future = loop.create_future()
                key = (execution_id, request_id)
                with pending_lock:
                    pending[key] = (loop, future)
                send({"type": "tool", "executionId": execution_id,
                      "id": request_id, "name": name, "args": args})
                return await future
            return call

    try:
        if message["name"] != "run_python":
            raise RuntimeError("Unknown tool name")
        source = message["input"]["code"]
        scope = {"tools": Tools(), "asyncio": asyncio}
        exec("async def __benchmark__():\n" + textwrap.indent(source, "    "), scope)
        value = asyncio.run(scope["__benchmark__"]())
        response = {"type": "result", "executionId": execution_id, "ok": True, "value": value}
        # Validate JSON before publishing any bytes; serialization failures are errors.
        json.dumps(response, allow_nan=False)
    except Exception as error:
        response = {"type": "result", "executionId": execution_id, "ok": False, "error": str(error)}
    with pending_lock:
        for key in [key for key in pending if key[0] == execution_id]:
            pending.pop(key)
    busy = False
    send(response)


send({"type": "ready", "version": "Python " + platform.python_version()})
for line in sys.stdin:
    message = json.loads(line)
    if message["type"] == "execute":
        if busy:
            raise RuntimeError("Executions must be serial")
        busy = True
        threading.Thread(target=execute, args=(message,), daemon=True).start()
    elif message["type"] == "tool-result":
        with pending_lock:
            entry = pending.pop((message["executionId"], message["id"]), None)
        if entry is None:
            raise RuntimeError("Unknown callback id")
        loop, future = entry

        def deliver(future=future, message=message):
            if not future.done():
                if message["ok"]:
                    future.set_result(message["value"])
                else:
                    future.set_exception(RuntimeError(message["error"]))

        loop.call_soon_threadsafe(deliver)
    else:
        raise RuntimeError("Unknown protocol message")
