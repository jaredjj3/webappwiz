# webappwiz/rpc

Define operations once with `satisfies Contract`, implement `Handlers<typeof
contract>`, and call them with `Client`. Both sides use the same Standard Schema
schemas (`webappwiz/t`, zod, or another implementation). The service exposes a
bound `fetch(Request): Promise<Response>` for an HTTP server or router to mount.

## Upload and process audio

```ts
import { Client, type Contract, type Handlers, Service } from "webappwiz/rpc";
import { t } from "webappwiz/t";

export const contract = {
  process: {
    type: "mutation",
    input: t.object({ instrument: t.string() }),
    files: { audio: "file" },
    output: t.object({ jobId: t.string() }),
  },
  status: {
    type: "query",
    input: t.object({ jobId: t.string() }),
    output: { format: "text" },
  },
  download: {
    type: "query",
    input: t.object({ jobId: t.string() }),
    output: { format: "file" },
  },
  remove: {
    type: "mutation",
    input: t.object({ jobId: t.string() }),
    output: { format: "empty" },
  },
} satisfies Contract;

// Implement these application operations in your own processing/storage layer.
const handlers: Handlers<typeof contract> = {
  process: async ({ instrument }, { files }) => {
    // files.audio is a File, including name, type, size and lastModified.
    const jobId = await startProcessing(files.audio, instrument);
    return { jobId };
  },
  status: async ({ jobId }) => await readStatus(jobId), // string
  download: async ({ jobId }) => ({
    data: new Blob([await readMidiBytes(jobId)]),
    contentType: "audio/midi",
    filename: `${jobId}.mid`,
  }),
  remove: async ({ jobId }) => {
    await removeJob(jobId); // resolves undefined; no response body
  },
};

export const service = new Service(contract, handlers, {
  maxRequestBytes: 32 * 1024 * 1024,
});
// Mount service.fetch at /rpc using your server.

const client = new Client(contract, "https://example.com/rpc");
const { jobId } = await client.call("process", { instrument: "piano" }, {
  files: { audio: selectedAudioFile }, // File from an input or drag and drop
});
const status: string = await client.call("status", { jobId });
const result = await client.call("download", { jobId });
// result: { data: Blob; contentType: string; filename?: string }
```

Missing handlers, wrong arguments, missing attachments and wrong return types
are compile-time errors. Use literal contracts, not a `Contract` annotation
that erases their specific keys and schemas. `In<M>` is the handler's parsed
input; `ClientInput<M>` is the client's input; `HandlerOutput<M>` is the handler
return value; `Out<M>` is the client's parsed result. `Files<M>` and `Context<M>`
also derive from the operation. Schemas with `unknown` input (including `t`)
use their output type for typed caller/handler values rather than accepting
anything.

## Formats

| `output` declaration | Handler value | Client result | HTTP success |
| --- | --- | --- | --- |
| A Standard Schema | Schema input | Schema output | 200 JSON |
| `{ format: "json", schema }` | Schema input | Schema output | 200 JSON |
| `{ format: "text" }` | `string` | `string` | 200 text/plain, UTF-8 |
| `{ format: "file" }` | `FileResult` | `FileResult` | 200 with declared media type |
| `{ format: "empty" }` | `undefined` | `undefined` | 204 without a body |

File data must be a `Blob` (a `File` is also a Blob). Wrap bytes with
`new Blob([bytes])`. `contentType` is required and must be a bare media type
such as `audio/midi` or `application/octet-stream`, without parameters.
`filename` is optional; when present it must be nonempty and contain no control
characters or path separators. The service emits a UTF-8 `filename*` in
`Content-Disposition: attachment`, and the client decodes it back, including
Unicode, spaces and punctuation. The client expects this canonical RPC
metadata encoding, not arbitrary third-party download responses. Upload names
and metadata are untrusted user input; applications decide acceptable formats
and safe storage names.

Returning a `Response` is rejected. `ctx.headers` can supply application headers,
but the codec owns status, content type, disposition, length and protocol
headers. `client.events.on("response", ...)` exposes response headers/status
before decoding; listeners should not consume its body (use `clone()` if needed).

Downloads do not click links or save files automatically. In a browser, saving
is an explicit action after a successful call, for example in a click handler:

```ts
const result = await client.call("download", { jobId });
const url = URL.createObjectURL(result.data);
const link = document.createElement("a");
link.href = url;
link.download = result.filename ?? "result.mid";
link.click();
// Revoke when the browser has had time to start the download.
setTimeout(() => URL.revokeObjectURL(url), 60_000);
```

## Transport, validation and limits

Queries retain GET with JSON in the `input` query parameter. Mutations without
attachments retain POST with a JSON body. Mutations declaring `files` use POST
multipart/form-data with a JSON `input` envelope and `file:<field>` parts. The
envelope carries structured input and original file metadata because multipart
parsers can normalize filenames and media types. The client sets the boundary.
Do not set multipart Content-Type yourself. Each `"file"` field requires exactly
one File; `"files"` requires a nonempty File array and preserves order. Unknown,
missing, duplicate single-file or non-file parts are rejected. Attachments are
not supported on queries. Files belong in `files`, not inside JSON input.

The service buffers request bodies up to `maxRequestBytes` (default 16 MiB),
counting actual bytes, including multipart overhead, regardless of Content-Length.
It cancels reading and returns 413 when the limit is exceeded. This is a body
limit, not a total memory limit: chunks, a contiguous buffer, parsed JSON,
FormData and File wrappers can coexist. Uploads are not streamed to handlers.
Downloads use a Blob on the server and are fully buffered into a Blob before
the client resolves. There is no RPC download size limit or streaming result
API. Set deployment/proxy limits and choose sizes appropriate for memory and
concurrent requests. Large or resumable transfers need a separate design.
GET input is limited by the URL limits of your server/proxies (often near 8 KiB);
use mutations for large structured inputs.

Inputs are checked locally before fetch and again on the server. JSON outputs
are validated on the server and decoded/validated on the client. Validation
checks both the supplied value and its serialized JSON representation, so use JSON-compatible wire values,
not Dates, Maps, BigInts, undefined top-level JSON values or cyclic objects.
Async Standard Schema validators are supported. Transforming schemas receive
wire values independently on each side: input transformations feed handlers;
output transformations feed client results. The server sends the schema's input
representation, not its transformed result, to avoid applying transformations
twice in sequence. Validators should be deterministic and side-effect free.
There is no schema fingerprint: incompatible payloads and formats are detected,
but semantically different contracts accepting the same payload cannot be.

## Errors and compatibility

All formats use the same non-2xx plain-text RPC error response, never a file.
`RpcError` has `status`, `code`, and `message` (prefixed by the method on the
client). Handlers may throw `new RpcError(409, "not ready")`; statuses must be
400 through 599. Unexpected exceptions are logged server-side and become a
sanitized 500. Output failures are also logged without exposing values to clients.

| Code | Meaning |
| --- | --- |
| `request_invalid` | Malformed input, invalid attachment map or failed input schema; 400 on server, status 0 for local validation |
| `request_too_large` | Request body exceeded the configured limit; 413 |
| `output_invalid` | Handler returned an invalid declared output; 500 |
| `handler_error` | Explicit handler RpcError |
| `internal_error` | Unexpected handler failure; 500 |
| `method_not_found` / `method_not_allowed` | Unknown operation (404) or wrong HTTP verb (405) |
| `response_invalid` | Client received incompatible protocol, format, metadata, status or schema; status is the received HTTP status |

Network failures and aborts retain fetch's native errors. Clients check failure
status and the RPC marker before decoding any successful file payload. A proxy
HTML error, old deployment, malformed JSON, or wrong response format produces
`response_invalid`, never a successful download. Successes carry
`x-webappwiz-rpc: 1:<format>`; failures carry `1:error` and
`x-webappwiz-rpc-error`. With `ServiceOptions.cors`, these headers and download
metadata are exposed to browsers along with handler headers.

Existing JSON contract declarations, handlers, calls, headers and GET/POST routes
remain supported. Stricter output validation and the 16 MiB request limit are
behavior changes. New clients require the protocol marker and therefore reject
0.0.14 servers; deploy the new service before updating clients. Old JSON clients
can read new JSON success bodies and plain-text errors. New attachment and
non-JSON formats require both sides to upgrade. Do not strip RPC headers at a
proxy or through custom CORS middleware.
