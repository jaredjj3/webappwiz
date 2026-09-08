import { expect, it } from "bun:test";
import { t } from "webappwiz/t";
import {
	Binary,
	Client,
	type Context,
	type Contract,
	type Handlers,
	type In,
	type Middleware,
	type RequestContext,
	RpcError,
	Service,
} from "./index";

const contract = {
	text: {
		type: "query",
		input: t.object({ name: t.string() }),
		output: { format: "text" },
	},
	json: {
		type: "mutation",
		input: t.object({}),
		output: t.object({ ok: t.boolean() }),
	},
	file: {
		type: "mutation",
		input: t.object({}),
		files: { audio: Binary.file() },
		output: Binary.file(),
	},
	empty: { type: "mutation", input: t.object({}), output: { format: "empty" } },
} satisfies Contract;
const handlers: Handlers<typeof contract> = {
	text: ({ name }) => name,
	json: () => ({ ok: true }),
	file: (_input, { files }) => files.audio,
	empty: () => undefined,
};
const request = () => new Request('http://test/text?input={"name":"hello"}');

it("supports class handlers, inherited methods and constructor injection", async () => {
	class Greeting {
		constructor(private prefix: string) {}
		format(name: string) {
			return `${this.prefix} ${name}`;
		}
	}
	class Base {
		constructor(protected greeting: Greeting) {}
		text(
			{ name }: In<typeof contract.text>,
			ctx: Context<typeof contract.text>,
		): string {
			ctx.headers.set("x-class", "yes");
			return this.greeting.format(name);
		}
	}
	class Implementation extends Base implements Handlers<typeof contract> {
		json = handlers.json;
		file = handlers.file;
		empty = handlers.empty;
	}
	const service = new Service(contract, new Implementation(new Greeting("Hi")));
	const response = await service.fetch(request());
	expect(await response.text()).toBe("Hi hello");
	expect(response.headers.get("x-class")).toBe("yes");
	const inherited = { toString: contract.text } satisfies Contract;
	expect(
		() => new Service(inherited, {} as Handlers<typeof inherited>),
	).toThrow("missing RPC handler");
});

it("wraps every response format in registration order", async () => {
	const calls: string[] = [];
	const layer = (name: string): Middleware => ({
		async handle(ctx, next) {
			calls.push(`${ctx.method}:${name}:before`);
			expect(ctx.request.bodyUsed).toBe(false);
			await next();
			calls.push(`${ctx.method}:${name}:after`);
		},
	});
	const service = new Service(contract, handlers, {
		middleware: [layer("outer"), layer("inner")],
	});
	const server = Bun.serve({ port: 0, fetch: service.fetch });
	try {
		const client = new Client(contract, server.url.toString());
		expect(await client.call("text", { name: "hi" })).toBe("hi");
		expect(await client.call("json", {})).toEqual({ ok: true });
		expect(await client.call("empty", {})).toBeUndefined();
		const result = await client.call(
			"file",
			{},
			{
				files: { audio: new File(["123"], "test.wav", { type: "audio/wav" }) },
			},
		);
		expect(await result.data.text()).toBe("123");
		for (const name of ["text", "json", "empty", "file"]) {
			expect(calls.splice(0, 4)).toEqual([
				`${name}:outer:before`,
				`${name}:inner:before`,
				`${name}:inner:after`,
				`${name}:outer:after`,
			]);
		}
	} finally {
		server.stop(true);
	}
});

it("auth middleware rejects before input or uploads are consumed", async () => {
	let handled = false;
	const service = new Service(
		contract,
		{
			...handlers,
			file: () => {
				handled = true;
				return new File([], "empty");
			},
		},
		{
			cors: "*",
			middleware: [
				{
					handle: async (ctx) => {
						expect(ctx.request.bodyUsed).toBe(false);
						ctx.headers.set("www-authenticate", "Bearer");
						throw new RpcError(401, "sign in required");
					},
				},
			],
		},
	);
	const req = new Request("http://test/file", {
		method: "POST",
		body: "not even multipart",
	});
	const response = await service.fetch(req);
	expect(req.bodyUsed).toBe(false);
	expect(handled).toBe(false);
	expect(response.status).toBe(401);
	expect(response.headers.get("www-authenticate")).toBe("Bearer");
	expect(response.headers.get("x-webappwiz-rpc-error")).toBe("handler_error");
	expect(response.headers.get("access-control-expose-headers")).toContain(
		"www-authenticate",
	);
	const server = Bun.serve({ port: 0, fetch: service.fetch });
	try {
		await expect(
			new Client(contract, server.url.toString()).call(
				"file",
				{},
				{ files: { audio: new File([], "empty") } },
			),
		).rejects.toMatchObject({ code: "handler_error", status: 401 });
	} finally {
		server.stop(true);
	}
});

it("applies post-next headers and deletions while preserving codec headers", async () => {
	const service = new Service(
		contract,
		{
			...handlers,
			text: (_input, ctx) => {
				ctx.headers.set("x-remove", "old");
				return "hello";
			},
		},
		{
			middleware: [
				{
					handle: async (ctx, next) => {
						ctx.headers.set("x-before", "yes");
						ctx.headers.append("set-cookie", "session=abc; HttpOnly");
						await next();
						ctx.headers.delete("x-remove");
						ctx.headers.set("x-after", "yes");
						ctx.headers.append("set-cookie", "csrf=xyz");
						ctx.headers.set("content-type", "text/html");
						ctx.headers.set("content-disposition", "attachment");
						ctx.headers.set("x-webappwiz-rpc", "1:file");
					},
				},
			],
		},
	);
	const response = await service.fetch(request());
	expect(response.headers.getSetCookie()).toEqual([
		"session=abc; HttpOnly",
		"csrf=xyz",
	]);
	expect(response.headers.get("x-before")).toBe("yes");
	expect(response.headers.get("x-after")).toBe("yes");
	expect(response.headers.has("x-remove")).toBe(false);
	expect(response.headers.get("content-type")).toBe(
		"text/plain; charset=utf-8",
	);
	expect(response.headers.has("content-disposition")).toBe(false);
	expect(response.headers.get("x-webappwiz-rpc")).toBe("1:text");
});

it("unwinds on input, handler and output failures; excludes routing and preflights", async () => {
	const calls: string[] = [];
	const service = new Service(
		contract,
		{
			...handlers,
			text: () => {
				throw new RpcError(403, "no");
			},
			json: () => ({ ok: "invalid" }) as unknown as { ok: boolean },
		},
		{
			cors: "*",
			middleware: [
				{
					handle: async (ctx, next) => {
						try {
							await next();
						} finally {
							calls.push(ctx.method);
							ctx.headers.set("x-finished", "yes");
						}
					},
				},
			],
		},
	);
	const denied = await service.fetch(request());
	expect(denied.status).toBe(403);
	expect(denied.headers.get("x-finished")).toBe("yes");
	expect(
		(
			await service.fetch(
				new Request("http://test/json", { method: "POST", body: "{" }),
			)
		).status,
	).toBe(400);
	expect(
		(
			await service.fetch(
				new Request("http://test/json", { method: "POST", body: "{}" }),
			)
		).status,
	).toBe(500);
	expect(calls).toEqual(["text", "json", "json"]);
	for (const req of [
		new Request("http://test/unknown"),
		new Request("http://test/json"),
		new Request("http://test/json", { method: "OPTIONS" }),
	]) {
		await service.fetch(req);
	}
	expect(calls).toHaveLength(3);
});

it("sanitizes middleware errors before and after next", async () => {
	for (const after of [false, true]) {
		const service = new Service(contract, handlers, {
			middleware: [
				{
					handle: async (_ctx, next) => {
						if (after) {
							await next();
						}
						throw new Error("secret database details");
					},
				},
			],
		});
		const response = await service.fetch(request());
		expect(response.status).toBe(500);
		expect(await response.text()).toBe("internal error");
		expect(response.headers.get("x-webappwiz-rpc-error")).toBe(
			"internal_error",
		);
	}
});

it("rejects double next, omitted next and response escape attempts", async () => {
	let executions = 0;
	const invalid: Middleware[] = [
		{
			handle: async (_ctx, next) => {
				await next();
				await next();
			},
		},
		{ async handle() {} },
		{
			// @ts-expect-error middleware cannot return an arbitrary Response
			handle: async (_ctx, next) => {
				await next();
				return new Response("escape");
			},
		},
	];
	for (const middleware of invalid) {
		const before = executions;
		const service = new Service(
			contract,
			{
				...handlers,
				text: () => {
					executions++;
					return "hello";
				},
			},
			{ middleware: [middleware] },
		);
		const response = await service.fetch(request());
		expect(response.status).toBe(500);
		expect(executions - before).toBeLessThanOrEqual(1);
	}
});

it("shares RequestContext with handlers and preserves class middleware injection", async () => {
	const { TimingMiddleware } = await import("./examples/middleware");
	const entries: { method: string; durationMs: number }[] = [];
	const seen = new Map<Request, RequestContext>();
	class CaptureMiddleware implements Middleware {
		constructor(private readonly contexts: Map<Request, RequestContext>) {}
		async handle(
			ctx: RequestContext,
			next: () => Promise<void>,
		): Promise<void> {
			this.contexts.set(ctx.request, ctx);
			ctx.headers.set("x-before", "yes");
			await next();
			ctx.headers.set("x-after", "yes");
		}
	}
	const service = new Service(
		contract,
		{
			...handlers,
			text: async ({ name }, ctx) => {
				const shared: RequestContext = ctx;
				expect(shared.method).toBe("text");
				const captured = seen.get(ctx.request);
				if (!captured) {
					throw new Error("middleware did not capture request");
				}
				expect(shared.request).toBe(captured.request);
				expect(shared.headers).toBe(captured.headers);
				expect(shared.headers.get("x-before")).toBe("yes");
				return name;
			},
		},
		{
			middleware: [
				new TimingMiddleware({
					info: (entry) => {
						entries.push(entry);
					},
				}),
				new CaptureMiddleware(seen),
			],
		},
	);
	const responses = await Promise.all([
		service.fetch(request()),
		service.fetch(request()),
	]);
	for (const response of responses) {
		expect(await response.text()).toBe("hello");
		expect(response.headers.get("x-after")).toBe("yes");
	}
	expect(seen.size).toBe(2);
	expect(entries).toHaveLength(2);
	for (const entry of entries) {
		expect(entry.method).toBe("text");
		expect(entry.durationMs).toBeGreaterThanOrEqual(0);
	}
});

it("requires middleware objects and protects the context stage at compile time", () => {
	const checks = (
		ctx: RequestContext,
		handlerCtx: Context<typeof contract.file>,
	) => {
		// @ts-expect-error bare functions are not Middleware implementations
		const invalid: Middleware = async () => {};
		// @ts-expect-error request files are unavailable before validation
		ctx.files;
		// @ts-expect-error shared references cannot be replaced
		ctx.headers = new Headers();
		// @ts-expect-error operation name is readonly
		handlerCtx.method = "other";
		const audio: File = handlerCtx.files.audio;
		return { invalid, audio };
	};
	expect(checks).toBeInstanceOf(Function);
});
