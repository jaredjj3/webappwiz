import type { Contract, Handlers } from "./contract";
import { RpcError } from "./error";
import { checkFiles, encode, protocol, validate } from "./transport";

export type MiddlewareContext = {
	/** The matched operation name. Middleware runs only for valid routes and verbs. */
	readonly method: string;
	readonly request: Request;
	/** Application response headers, shared with the handler and other middleware. */
	readonly headers: Headers;
};
/** Await next exactly once, or throw to reject. The RPC codec owns the response. */
export type Middleware = (
	ctx: MiddlewareContext,
	next: () => Promise<void>,
) => Promise<void>;

export type ServiceOptions = {
	/**
	 * Allowed browser origin, e.g. "*" or "https://app.example.com". Omit to
	 * send no CORS headers at all, which is right for same-origin clients.
	 */
	cors?: string;
	/** Maximum buffered request body, including multipart overhead. Default: 16 MiB. */
	maxRequestBytes?: number;
	/** Wrap every matched operation, in registration order, before reading its body. */
	middleware?: readonly Middleware[];
};

/**
 * Answers a contract over HTTP. A service is not a server: it binds no port and
 * its whole surface is `fetch`, the shape every fetch-style runtime already
 * takes, so whatever is listening hands requests straight to it.
 *
 *     http.serve(service.fetch, { port })   // webappwiz/http
 *     export default service                // Workers, Deno
 *     app.mount("/rpc", service.fetch)      // Hono
 */
export class Service<C extends Contract> {
	constructor(
		private contract: C,
		private handlers: Handlers<NoInfer<C>>,
		private opts: ServiceOptions = {},
	) {
		if (
			!Number.isSafeInteger(opts.maxRequestBytes ?? 16 * 1024 * 1024) ||
			(opts.maxRequestBytes ?? 1) < 1
		) {
			throw new Error("maxRequestBytes must be a positive safe integer");
		}
		for (const name of Object.keys(contract)) {
			if (!hasHandler(handlers, name)) {
				throw new Error(`missing RPC handler: ${name}`);
			}
		}
	}

	/** Bound, so it survives being passed around detached from the instance. */
	readonly fetch = async (req: Request): Promise<Response> => {
		const res = await this.dispatch(req);
		const { cors } = this.opts;
		if (cors !== undefined) {
			// without this a cross-origin caller cannot read the headers handlers set
			res.headers.set(
				"access-control-expose-headers",
				[...res.headers.keys()].join(", "),
			);
			res.headers.set("access-control-allow-origin", cors);
			if (cors !== "*") {
				// "*" is incompatible with credentials, so only a real origin gets them
				res.headers.set("access-control-allow-credentials", "true");
				res.headers.set("vary", "origin");
			}
		}
		return res;
	};

	private async dispatch(req: Request): Promise<Response> {
		if (this.opts.cors !== undefined && req.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: {
					"access-control-allow-methods": "GET, POST, OPTIONS",
					"access-control-allow-headers":
						req.headers.get("access-control-request-headers") ?? "content-type",
					"access-control-max-age": "86400",
				},
			});
		}
		const url = new URL(req.url);
		// the last segment only, so this can be mounted under any path prefix
		let name: string;
		try {
			name = decodeURIComponent(url.pathname.split("/").pop() ?? "");
		} catch {
			return failure(400, "invalid method encoding", "request_invalid");
		}
		const method = Object.hasOwn(this.contract, name)
			? this.contract[name]
			: undefined;
		if (method === undefined) {
			return failure(404, "unknown method", "method_not_found");
		}
		const verb = method.type === "query" ? "GET" : "POST";
		if (req.method !== verb) {
			return failure(405, `${name} requires ${verb}`, "method_not_allowed");
		}
		const headers = new Headers();
		let response: Response | undefined;
		try {
			await runMiddleware(
				this.opts.middleware ?? [],
				{ method: name, request: req, headers },
				async () => {
					response = await this.execute(name, method, req, url, headers);
				},
			);
			if (!response) {
				throw new Error("middleware did not complete the operation");
			}
		} catch (error) {
			response = executionFailure(name, error);
		}
		// Response constructors copy Headers. Apply application headers once more so
		// middleware's post-next changes reach both successful and failed calls.
		for (const key of [...response.headers.keys()]) {
			if (!reservedHeaders.has(key)) {
				response.headers.delete(key);
			}
		}
		for (const [key, value] of headers) {
			if (!reservedHeaders.has(key) && key !== "set-cookie") {
				response.headers.set(key, value);
			}
		}
		for (const cookie of headers.getSetCookie()) {
			response.headers.append("set-cookie", cookie);
		}
		return response;
	}

	private async execute(
		name: string,
		method: Contract[string],
		req: Request,
		url: URL,
		headers: Headers,
	): Promise<Response> {
		let input: unknown;
		let files = {};
		try {
			let raw: unknown;
			if (method.type === "query") {
				raw = JSON.parse(url.searchParams.get("input") ?? "");
			} else {
				const contentType = req.headers.get("content-type") ?? "";
				const body = await readBody(
					req,
					this.opts.maxRequestBytes ?? 16 * 1024 * 1024,
				);
				if (method.files) {
					if (!contentType.startsWith("multipart/form-data;")) {
						throw new Error("expected multipart/form-data");
					}
					const form = await new Response(body, {
						headers: { "content-type": contentType },
					}).formData();
					const entries = form.getAll("input");
					if (entries.length !== 1 || typeof entries[0] !== "string") {
						throw new Error("expected one input part");
					}
					const envelope = JSON.parse(entries[0]);
					raw = envelope.input;
					const attachments: Record<string, File | File[]> =
						Object.create(null);
					for (const key of form.keys()) {
						if (
							key !== "input" &&
							(!key.startsWith("file:") ||
								!Object.hasOwn(method.files, key.slice(5)))
						) {
							throw new Error(`unexpected multipart part: ${key}`);
						}
					}
					for (const [key, declaration] of Object.entries(method.files)) {
						const kind =
							typeof declaration === "string" ? declaration : declaration.kind;
						const parts = form.getAll(`file:${key}`);
						const metadata = Object.hasOwn(envelope.metadata ?? {}, key)
							? envelope.metadata[key]
							: undefined;
						if (
							metadata === undefined &&
							parts.length === 0 &&
							typeof declaration !== "string" &&
							declaration.isOptional
						) {
							continue;
						}
						if (!Array.isArray(metadata) || metadata.length !== parts.length) {
							throw new Error(`files.${key}: invalid metadata`);
						}
						const values = parts.map((part, i) => {
							if (
								!(part instanceof File) ||
								!metadata[i] ||
								typeof metadata[i].name !== "string" ||
								typeof metadata[i].type !== "string" ||
								!Number.isSafeInteger(metadata[i].lastModified)
							) {
								throw new Error(`files.${key}: invalid file or lastModified`);
							}
							return new File([part], metadata[i].name, {
								type: metadata[i].type,
								lastModified: metadata[i].lastModified,
							});
						});
						if (kind === "file" && values.length !== 1) {
							throw new Error(`files.${key}: expected one file`);
						}
						const first = values[0];
						if (kind === "file" && first) {
							attachments[key] = first;
						} else {
							attachments[key] = values;
						}
					}
					files = checkFiles(method.files, attachments);
				} else {
					raw = JSON.parse(new TextDecoder().decode(body));
				}
			}
			input = await validate(method.input, raw);
		} catch (e) {
			if (
				e instanceof RpcError &&
				e.code === "request_too_large" &&
				e.status === 413
			) {
				return failure(e.status, e.message, e.code);
			}
			return failure(
				400,
				e instanceof Error ? e.message : "invalid request",
				"request_invalid",
			);
		}
		let output: unknown;
		try {
			// The validated lookup cannot be correlated with its mapped handler by TS.
			output = await this.handlers[name as keyof C](
				input as never,
				{
					request: req,
					headers,
					files,
				} as never,
			);
		} catch (e) {
			return executionFailure(name, e);
		}
		try {
			return await encode(method.output, output, headers);
		} catch (e) {
			console.error(`rpc ${name} output:`, e);
			return failure(500, "invalid handler output", "output_invalid");
		}
	}
}

function failure(
	status: number,
	message: string,
	code: import("./error").RpcErrorCode,
): Response {
	return new Response(message, {
		status,
		headers: {
			"content-type": "text/plain; charset=utf-8",
			[protocol]: "1:error",
			"x-webappwiz-rpc-error": code,
		},
	});
}

async function readBody(
	req: Request,
	limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
	const reader = req.body?.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	if (reader) {
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				size += value.byteLength;
				if (size > limit) {
					await reader.cancel();
					throw new RpcError(
						413,
						"request body exceeds maxRequestBytes",
						"request_too_large",
					);
				}
				chunks.push(value);
			}
		} finally {
			reader.releaseLock();
		}
	}
	const body = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return body;
}

/** Class methods may be inherited, but Object.prototype is never an RPC implementation. */
function hasHandler(handlers: object, name: string): boolean {
	let current: object | null = handlers;
	while (current !== null && current !== Object.prototype) {
		const descriptor = Object.getOwnPropertyDescriptor(current, name);
		if (descriptor) {
			if (current !== handlers && name === "constructor") {
				return false;
			}
			return typeof descriptor.value === "function";
		}
		current = Object.getPrototypeOf(current);
	}
	return false;
}

function executionFailure(name: string, error: unknown): Response {
	if (
		error instanceof RpcError &&
		Number.isInteger(error.status) &&
		error.status >= 400 &&
		error.status <= 599
	) {
		return failure(error.status, error.message, "handler_error");
	}
	console.error(`rpc ${name}:`, error);
	return failure(500, "internal error", "internal_error");
}

const reservedHeaders = new Set([
	"content-type",
	"content-disposition",
	"content-length",
	"content-encoding",
	"transfer-encoding",
	protocol,
	"x-webappwiz-rpc-error",
]);

async function runMiddleware(
	middleware: readonly Middleware[],
	ctx: MiddlewareContext,
	terminal: () => Promise<void>,
): Promise<void> {
	const run = async (index: number): Promise<void> => {
		const step = middleware[index];
		if (step === undefined) {
			return terminal();
		}
		let called = false;
		let closed = false;
		let repeated = false;
		let pending: Promise<void> | undefined;
		try {
			const result: unknown = await step(ctx, () => {
				if (closed || called) {
					repeated = true;
					throw new Error(
						"middleware next must be called exactly once during execution",
					);
				}
				called = true;
				pending = run(index + 1);
				// Observe rejections immediately, even if middleware forgets to await next.
				void pending.catch(() => {});
				return pending;
			});
			if (!called || repeated || result !== undefined) {
				throw new Error(
					"middleware must await next once or throw; returning a response is not supported",
				);
			}
			await pending;
		} finally {
			closed = true;
			// Do not leave a started handler running after the HTTP call completes.
			await pending?.catch(() => {});
		}
	};
	await run(0);
}
