import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { t } from "@webappwiz/t";

import {
	Client,
	type Contract,
	type Handlers,
	RpcError,
	Server,
} from "./index";

describe("rpc", () => {
	const contract = {
		getTodo: {
			type: "query",
			input: t.object({ id: t.number() }),
			output: t.object({ title: t.string() }),
		},
		addTodo: {
			type: "mutation",
			input: t.object({ title: t.string() }),
			output: t.object({ id: t.number() }),
		},
		boom: {
			type: "mutation",
			input: t.object({}),
			output: t.object({}),
		},
		secret: {
			type: "mutation",
			input: t.object({}),
			output: t.object({}),
		},
	} satisfies Contract;

	const handlers: Handlers<typeof contract> = {
		getTodo: ({ id }, ctx) => {
			ctx.headers.set("cache-control", "max-age=60");
			ctx.headers.set(
				"x-seen-auth",
				ctx.request.headers.get("authorization") ?? "",
			);
			return { title: `todo ${id}` };
		},
		addTodo: ({ title }) => ({ id: title.length }),
		boom: () => {
			throw new Error("kaboom in table users");
		},
		secret: () => {
			throw new RpcError(403, "not yours");
		},
	};

	const server = new Server(contract, handlers);
	let listener: ReturnType<typeof Bun.serve>;
	let base: string;
	let client: Client<typeof contract>;

	beforeAll(() => {
		listener = Bun.serve({ port: 0, fetch: server.fetch });
		base = listener.url.origin;
		client = new Client(contract, base);
	});

	afterAll(() => listener.stop(true));

	it("mutation round-trips over POST", async () => {
		const { id } = await client.call("addTodo", { title: "milk" });
		expect(id).toBe(4);
	});

	it("query round-trips over GET", async () => {
		const { title } = await client.call("getTodo", { id: 7 });
		expect(title).toBe("todo 7");
	});

	it("handlers set response headers", async () => {
		const res = await fetch(
			`${base}/getTodo?input=${encodeURIComponent('{"id":1}')}`,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe("max-age=60");
	});

	it("request headers merge, per-call over constructor, and reach handlers", async () => {
		const authed = new Client(contract, base, {
			headers: { authorization: "default" },
		});
		let seen = "";
		await authed.call(
			"getTodo",
			{ id: 1 },
			{
				headers: { authorization: "per-call" },
				onResponse: (res) => {
					seen = res.headers.get("x-seen-auth") ?? "";
				},
			},
		);
		expect(seen).toBe("per-call");

		await authed.call(
			"getTodo",
			{ id: 1 },
			{
				onResponse: (res) => {
					seen = res.headers.get("x-seen-auth") ?? "";
				},
			},
		);
		expect(seen).toBe("default");
	});

	it("schema failures are 400 with a field path", async () => {
		const res = await fetch(`${base}/addTodo`, {
			method: "POST",
			body: JSON.stringify({ title: 42 }),
		});
		expect(res.status).toBe(400);
		expect(await res.text()).toBe("title: expected string");
	});

	it("malformed JSON is 400", async () => {
		const res = await fetch(`${base}/addTodo`, {
			method: "POST",
			body: "{nope",
		});
		expect(res.status).toBe(400);
	});

	it("unknown methods are 404", async () => {
		const res = await fetch(`${base}/nope`, { method: "POST", body: "{}" });
		expect(res.status).toBe(404);
	});

	it("wrong verb for a method is 405", async () => {
		const res = await fetch(`${base}/getTodo`, { method: "POST", body: "{}" });
		expect(res.status).toBe(405);
	});

	it("unplanned throws are a 500 that leaks nothing", async () => {
		const err = await client.call("boom", {}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(RpcError);
		expect((err as RpcError).status).toBe(500);
		expect((err as RpcError).message).toBe("boom: internal error");
	});

	it("RpcError carries its status and message to the caller", async () => {
		const err = await client.call("secret", {}).catch((e: unknown) => e);
		expect((err as RpcError).status).toBe(403);
		expect((err as RpcError).message).toBe("secret: not yours");
	});

	it("an aborted signal cancels the call", async () => {
		expect(
			client.call("getTodo", { id: 1 }, { signal: AbortSignal.abort() }),
		).rejects.toThrow();
	});

	it("the server dispatches under any mount prefix", async () => {
		const res = await server.fetch(
			new Request(
				`http://mounted/api/v1/getTodo?input=${encodeURIComponent('{"id":3}')}`,
			),
		);
		expect(await res.json()).toEqual({ title: "todo 3" });
	});

	it("cors is off by default and opt-in per server", async () => {
		expect(
			(await server.fetch(new Request(`${base}/boom`, { method: "OPTIONS" })))
				.status,
		).toBe(405);

		const open = new Server(contract, handlers, { cors: "https://app.test" });
		const preflight = await open.fetch(
			new Request(`${base}/addTodo`, {
				method: "OPTIONS",
				headers: { "access-control-request-headers": "authorization" },
			}),
		);
		expect(preflight.status).toBe(204);
		expect(preflight.headers.get("access-control-allow-headers")).toBe(
			"authorization",
		);
		expect(preflight.headers.get("access-control-allow-origin")).toBe(
			"https://app.test",
		);
		expect(preflight.headers.get("access-control-allow-credentials")).toBe(
			"true",
		);

		const res = await open.fetch(
			new Request(`${base}/getTodo?input=${encodeURIComponent('{"id":1}')}`),
		);
		expect(res.headers.get("access-control-allow-origin")).toBe(
			"https://app.test",
		);
		// handler-set headers are unreadable cross-origin unless they are exposed
		expect(res.headers.get("access-control-expose-headers")).toContain(
			"x-seen-auth",
		);
	});

	it("inputs are compile-time checked", () => {
		// @ts-expect-error title must be a string
		const bad = () => client.call("addTodo", { title: 42 });
		expect(bad).toBeInstanceOf(Function);
	});
});
