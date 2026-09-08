# webappwiz/rpc

Define operations once with `satisfies Contract`, implement `Handlers<typeof
contract>`, and call them with `Client`. Both sides use the same Standard Schema
schemas (`webappwiz/t`, zod, or another implementation). The service exposes a
bound `fetch(Request): Promise<Response>` for an HTTP server or router to mount.

## Upload and process audio

```ts
import { Binary, Client, type Context, type Contract, type Handlers, type In, Service } from "webappwiz/rpc";
import { t } from "webappwiz/t";

export const contract = {
  process: {
    type: "mutation",
    input: t.object({ instrument: t.string() }),
    files: { audio: Binary.file().audio().maxMB(25) },
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
    output: Binary.file().contentTypes("audio/midi").maxMB(10),
  },
  remove: {
    type: "mutation",
    input: t.object({ jobId: t.string() }),
    output: { format: "empty" },
  },
} satisfies Contract;

// Implement this dependency in your application's processing/storage layer.
interface AudioJobs {
  start(audio: File, instrument: string): Promise<string>;
  status(jobId: string): Promise<string>;
  midi(jobId: string): Promise<Blob>;
  remove(jobId: string): Promise<void>;
}

class AudioHandlers implements Handlers<typeof contract> {
  constructor(private readonly jobs: AudioJobs) {}

  async process(
    { instrument }: In<typeof contract.process>,
    { files }: Context<typeof contract.process>,
  ) {
    return { jobId: await this.jobs.start(files.audio, instrument) };
  }

  async status({ jobId }: In<typeof contract.status>) {
    return this.jobs.status(jobId);
  }

  async download({ jobId }: In<typeof contract.download>) {
    return new File([await this.jobs.midi(jobId)], `${jobId}.mid`, {
      type: "audio/midi",
    });
  }

  async remove({ jobId }: In<typeof contract.remove>) {
    await this.jobs.remove(jobId);
  }
}

const handlers = new AudioHandlers(jobs);

export const service = new Service(contract, handlers, {
  maxRequestBytes: 32_000_000,
});
// Mount service.fetch at /rpc using your server.

const client = new Client(contract, "https://example.com/rpc");
const { jobId } = await client.call("process", { instrument: "piano" }, {
  files: { audio: selectedAudioFile }, // File from an input or drag and drop
});
const status: string = await client.call("status", { jobId });
const result = await client.call("download", { jobId });
// result: { data: Blob; contentType: string; filename: string }
```

Missing handlers, wrong arguments, missing attachments and wrong return types
are compile-time errors. Use literal contracts, not a `Contract` annotation
that erases their specific keys and schemas. `In<M>` is the handler's parsed
input; `ClientInput<M>` is the client's input; `HandlerOutput<M>` is the handler
return value; `Out<M>` is the client's parsed result. `Files<M>` and `Context<M>`
also derive from the operation. Schemas with `unknown` input (including `t`)
use their output type for typed caller/handler values rather than accepting
anything.

## Service middleware and class implementations

`ServiceOptions.middleware` wraps every matched operation before its body is
read. No middleware declaration is needed in the contract:

```ts
import { Service, type Middleware, type RequestContext } from "webappwiz/rpc";

interface Logger {
  info(entry: { method: string; durationMs: number }): void;
}

class TimingMiddleware implements Middleware {
  constructor(private readonly logger: Logger) {}

  async handle(ctx: RequestContext, next: () => Promise<void>): Promise<void> {
    const start = performance.now();
    try {
      await next();
    } finally {
      this.logger.info({ method: ctx.method, durationMs: performance.now() - start });
    }
  }
}

const timing = new TimingMiddleware(logger);
const service = new Service(contract, handlers, {
  middleware: [timing],
});
```

Middleware is an interface with `handle(ctx, next)`, not a function or an abstract
base class. Both class instances and plain objects with a `handle` method work;
the service preserves the method's `this` receiver. An instance may handle
concurrent requests, so keep request-specific state in local variables.

`RequestContext` is the common context shared with handlers:

```ts
interface RequestContext {
  readonly method: string;
  readonly request: Request;
  readonly headers: Headers;
}

type Context<M> = RequestContext & { readonly files: Files<M> };
```

Handlers receive the same request and headers references, plus validated files.
Middleware cannot access parsed files before body parsing. Readonly fields
prevent replacing those references; `ctx.headers.set(...)` remains supported.

Middleware receives the operation name as `ctx.method`, the original
`ctx.request`, and shared `ctx.headers`. It returns `Promise<void>` and must
await `next()` exactly once, or throw to reject the call. Registration order is
outermost first: `[a, b]` executes `a before`, `b before`, operation, `b after`,
`a after`. `next()` includes input/file validation, handler execution and output
validation/encoding. Timing does not include the client's download time.

Authentication can use a class with constructor-injected dependencies. It runs before JSON or multipart buffering:

```ts
import { RpcError, type Middleware, type RequestContext } from "webappwiz/rpc";

interface Sessions {
  authenticate(request: Request): Promise<boolean>;
}

class AuthenticationMiddleware implements Middleware {
  constructor(private readonly sessions: Sessions) {}

  async handle({ request, headers }: RequestContext, next: () => Promise<void>) {
    if (!await this.sessions.authenticate(request)) {
      headers.set("www-authenticate", "Bearer");
      throw new RpcError(401, "Sign in required");
    }
    await next();
  }
}

const authenticated = new AuthenticationMiddleware(sessions);
```

Explicit RpcErrors from middleware use the existing `handler_error` category.
Unexpected exceptions are logged and become sanitized `internal_error` 500s.
A thrown error after `next()` replaces the prepared response with an RPC error.
Handler and validation failures are already converted to RPC responses inside
`next()`, so they resolve it normally; middleware `finally` still runs. This
hook does not add typed identity context. Resource authorization using validated
inputs can live in the injected handler implementation.

Changes to application headers before or after `next()` reach the final response,
including failures; deleting a header and appending multiple Set-Cookie values
are supported. The codec still owns content type, disposition, length, encoding
and RPC headers. Middleware cannot return a Response or substitute an output.
Calling `next` twice or returning normally without calling it is an internal
error, and never executes the handler twice. Do not consume the request body
in middleware. Unknown routes, wrong HTTP verbs and CORS preflights bypass this
hook; wrap `service.fetch` for logging those HTTP requests too.

Handler implementations may be POJOs or class instances. Prototype methods,
including inherited methods, retain their `this` receiver, allowing constructor
injection. For the audio-processing contract above:

```ts
import { type Context, type Handlers, type In, Service } from "webappwiz/rpc";

type Process = typeof contract.process;

// A focused service can implement a subset contract; all methods in the
// supplied contract must have implementations.
const processingContract = { process: contract.process };

interface Processor {
  enqueue(audio: File, instrument: string): Promise<string>;
}

class AudioService implements Handlers<typeof processingContract> {
  constructor(private readonly processor: Processor) {}

  async process(input: In<Process>, ctx: Context<Process>) {
    return {
      jobId: await this.processor.enqueue(ctx.files.audio, input.instrument),
    };
  }
}

const service = new Service(processingContract, new AudioService(processor), {
  middleware: [timing, authenticated],
});
```

TypeScript's `implements` checks method signatures but does not infer parameter
types. Use `In<Operation>` and `Context<Operation>` as shown. Ordinary
Object.prototype methods do not count as implementations of RPC operations.

## Binary declarations

`files` names the operation's multipart attachment fields; `Binary` declares
what each field accepts. The key remains `files` because its values are File
objects or arrays of Files. These immutable builders are exported from
`webappwiz/rpc` and can be reused across contracts:

```ts
const audio = Binary.file().audio().maxMB(25);

files: {
  lead: audio,
  reference: audio.optional(),
  takes: Binary.files({ minCount: 1, maxCount: 8 })
    .audio()
    .maxMB(25)
    .maxTotalMB(100),
}
```

| API | Meaning / default |
| --- | --- |
| `Binary.file()` | One required File; zero bytes are accepted |
| `Binary.files({ minCount?, maxCount? })` | Required File array; defaults to zero or more, preserving order |
| `.optional()` | Field may be absent; inferred as an optional property |
| `.minBytes(n)` / `.maxBytes(n)` | Per-file byte bounds, inclusive; no bound when omitted |
| `.maxKB(n)` / `.maxMB(n)` / `.maxGB(n)` | Per-file bounds in decimal units; 1 MB = 1,000,000 bytes |
| `.maxTotalBytes(n)` / `.maxTotalKB(n)` / `.maxTotalMB(n)` / `.maxTotalGB(n)` | Collection-only aggregate bounds; excludes multipart overhead |
| `.contentTypes(...types)` | Accepted MIME types or family wildcards; unrestricted when omitted |
| `.audio()` / `.video()` | Shorthand for `.contentTypes("audio/*")` / `.contentTypes("video/*")` |

Each constraint call returns a new declaration. Repeating a size bound or
`contentTypes` replaces that bound or list. For example,
`.audio().contentTypes("audio/wav", "audio/mpeg")` narrows the broad preset.
Invalid counts, negative/nonfinite sizes, fractional byte counts, inverted bounds
and malformed MIME patterns fail when the contract is constructed. Fractional
KB/MB/GB values are accepted when they resolve to a safe integer byte count.

MIME comparisons are case-insensitive and ignore valid parameters such as
`charset=utf-8`. Common audio aliases are normalized for comparison only:
`audio/x-wav`, `audio/wave`, `audio/vnd.wave` map to `audio/wav`;
`audio/mp3` to `audio/mpeg`; `audio/x-flac` to `audio/flac`; and
`audio/x-midi` to `audio/midi`. Original metadata remains available to handlers
and callers. An empty File type is accepted only without a type restriction.
No type is inferred from a filename or extension. Presets validate declared
metadata, not file signatures, codecs, duration, dimensions or decodability.
Applications perform those checks in their processing layer.

Constraints are checked before client upload and independently on the server.
Failures identify the field and array index, for example
`files.takes[2]: maxBytes 25000000, received 26000000`. Aggregate/count failures
name the collection. They use the existing `request_invalid` error category.
The service-wide `maxRequestBytes` remains an independent deployment limit.

An absent optional collection differs from a present empty array. When every
attachment field is optional, callers may omit the third argument entirely.
When a required collection allows zero files, callers still pass its empty array.
Legacy `"file"` and `"files"` shorthands remain supported; legacy `"files"`
retains its nonempty-array requirement.

`output: Binary.file()` shares the same per-file constraints, and requires a
named result. A handler may return a native `File` or
`{ data: Blob, contentType: string, filename: string }`. Clients receive that
latter shape (`NamedFileResult`), with all constraints checked. A server output
violation becomes `output_invalid`; an incompatible download becomes
`response_invalid`. `Binary.files()` and optional binary declarations cannot be
response formats; multiple-file and streaming response transports are not
implemented.

## Runnable end-to-end example

[Shared contract](./examples/contract.ts), [handler class](./examples/handlers.ts),
[server](./examples/server.ts), [client](./examples/client.ts), and
[timing middleware](./examples/middleware.ts) provide a complete audio upload/report example.
The server reads uploaded bytes and computes a SHA-256 integrity report. It does
not decode audio, and the MIME preset does not claim that the bytes are valid
audio. An HTTP round-trip test exercises these exact example modules.

Start the server from the repository root:

```sh
bun packages/webappwiz/rpc/examples/server.ts
```

The client helper can run in a browser served on the same origin (or configure
CORS for a separate origin):

```ts
import { uploadAudio } from "./examples/client";

const selected = Array.from(fileInput.files ?? []);
const report = await uploadAudio("http://localhost:3000", "Session", selected);
console.log(report.filename, report.contentType, await report.data.text());
// Save report.data explicitly using an object URL if the user requests it.
```

## Formats

| `output` declaration | Handler value | Client result | HTTP success |
| --- | --- | --- | --- |
| A Standard Schema | Schema input | Schema output | 200 JSON |
| `{ format: "json", schema }` | Schema input | Schema output | 200 JSON |
| `{ format: "text" }` | `string` | `string` | 200 text/plain, UTF-8 |
| `Binary.file()` | `File` or `NamedFileResult` | `NamedFileResult` | 200 with declared media type |
| `{ format: "file" }` | `FileResult` | `FileResult` | 200 with declared media type |
| `{ format: "empty" }` | `undefined` | `undefined` | 204 without a body |

File data must be a `Blob` (a `File` is also a Blob). Wrap bytes with
`new Blob([bytes])`. `contentType` is required and must be a valid media type
such as `audio/midi` or `application/octet-stream`; valid MIME parameters are
preserved.
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
the client resolves. With a declared `maxBytes` (or KB/MB/GB equivalent), clients stop reading
and cancel the download when actual bytes exceed the limit, independent of
Content-Length. Without that constraint there is no RPC download size limit.
There is no streaming result API. Set deployment/proxy limits and choose sizes appropriate for memory and
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
