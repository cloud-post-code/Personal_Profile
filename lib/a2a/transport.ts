import { streamEventV03, taskV03 } from "./downgrade";
import { A2A_ERRORS, type A2ATaskWire, type ProtocolVersion, type StreamResponse } from "./types";

/**
 * Shared HTTP plumbing for both protocol bindings: the JSON-RPC envelope, the
 * SSE writer, and the version headers every response carries.
 */

export function versionHeaders(version: ProtocolVersion): Record<string, string> {
  return { "A2A-Version": version };
}

/**
 * Task-shaped results are built in v1.0 vocabulary; a 0.3 caller needs the
 * `kind`-tagged, lowercase-state spelling. The send result may be wrapped in a
 * SendMessageResponse oneof and ListTasks holds an array, so each shape is
 * unwrapped before translating. Both bindings render through this, which is
 * what keeps them saying the same thing.
 */
export function renderResult(value: unknown, version: ProtocolVersion): unknown {
  if (version === "1.0" || !value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  if (record.task) return taskV03(record.task as A2ATaskWire);
  if (Array.isArray(record.tasks)) {
    return { ...record, tasks: (record.tasks as A2ATaskWire[]).map(taskV03) };
  }
  if (record.status && record.id) return taskV03(record as unknown as A2ATaskWire);
  return value;
}

export function jsonRpcResult(id: unknown, result: unknown, version: ProtocolVersion): Response {
  return Response.json(
    { jsonrpc: "2.0", id: id ?? null, result },
    { headers: versionHeaders(version) },
  );
}

export function jsonRpcError(
  id: unknown,
  error: { code: number; message: string; data?: unknown },
  version: ProtocolVersion,
): Response {
  // JSON-RPC transport errors are still HTTP 200 with an error member; only
  // auth and rate limiting answer at the HTTP layer, which is where A2A puts
  // them (§7: credentials never travel in the payload).
  return Response.json(
    {
      jsonrpc: "2.0",
      id: id ?? null,
      error: {
        code: error.code,
        message: error.message,
        ...(error.data === undefined ? {} : { data: error.data }),
      },
    },
    { headers: versionHeaders(version) },
  );
}

export function httpError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

/**
 * 401 with the `WWW-Authenticate` challenge RFC 9110 requires. A2A clients read
 * it to learn which scheme to present, so omitting it turns "you need a token"
 * into an unexplained failure.
 */
export function unauthorized(message: string): Response {
  return Response.json(
    { error: message },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="a2a"' } },
  );
}

/** The error a caller gets when it asks for a protocol generation we don't speak. */
export function versionNotSupported(id: unknown): Response {
  return jsonRpcError(
    id,
    { ...A2A_ERRORS.versionNotSupported, data: { supported: ["1.0", "0.3"] } },
    "1.0",
  );
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Proxies that buffer will hold the whole answer back and defeat streaming.
  "X-Accel-Buffering": "no",
};

/**
 * Writes A2A stream events as SSE. `frame` decides what each `data:` line
 * carries — the JSON-RPC binding wraps every event in an envelope, the REST
 * binding sends the bare object — which is the only difference between the two
 * bindings' streams.
 */
export function sseResponse(
  events: AsyncGenerator<StreamResponse>,
  version: ProtocolVersion,
  frame: (event: unknown) => unknown,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of events) {
          const rendered =
            version === "1.0" ? event : streamEventV03(event as unknown as Record<string, unknown>);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame(rendered))}\n\n`));
        }
      } catch {
        // A stream that dies mid-answer closes; the task row keeps whatever
        // completed, so the caller can still GetTask for the result.
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { ...SSE_HEADERS, ...versionHeaders(version) } });
}
