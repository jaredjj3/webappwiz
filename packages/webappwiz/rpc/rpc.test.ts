import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Listening } from "webappwiz/http";
import { BunHttpServer } from "webappwiz/http/bun";
import { t } from "webappwiz/t";
import { Duration } from "webappwiz/time";

import {
	Client,
	type Contract,
	type Handlers,
	RpcError,
	Service,
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

	const service = new Service(contract, handlers);
	let listening: Listening;
	let base: string;
	let client: Client<typeof contract>;

	beforeAll(async () => {
		listening = await new BunHttpServer().serve(service.fetch, {
			port: 0,
			idleTimeout: Duration.secs(10),
		});
		base = `http://localhost:${listening.port}`;
		client = new Client(contract, base);
	});

	afterAll(() => listening.stop());

	it("round-trips over POST when calling a mutation", async () => {
		const { id } = await client.call("addTodo", { title: "milk" });
		expect(id).toBe(4);
	});

	it("round-trips over GET when calling a query", async () => {
		const { title } = await client.call("getTodo", { id: 7 });
		expect(title).toBe("todo 7");
	});

	it("carries handler-set headers on the response", async () => {
		const res = await fetch(
			`${base}/getTodo?input=${encodeURIComponent('{"id":1}')}`,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe("max-age=60");
	});

	it("sends merged headers to the handler, with per-call overriding the constructor", async () => {
		const authed = new Client(contract, base, {
			headers: { authorization: "default" },
		});
		let seen = "";
		authed.events.on("response", (res) => {
			seen = res.headers.get("x-seen-auth") ?? "";
		});

		await authed.call(
			"getTodo",
			{ id: 1 },
			{ headers: { authorization: "per-call" } },
		);
		expect(seen).toBe("per-call");

		await authed.call("getTodo", { id: 1 });
		expect(seen).toBe("default");
	});

	it("responds 400 with the field path when the input fails its schema", async () => {
		const res = await fetch(`${base}/addTodo`, {
			method: "POST",
			body: JSON.stringify({ title: 42 }),
		});
		expect(res.status).toBe(400);
		expect(await res.text()).toBe("title: expected string");
	});

	it("responds 400 when the body is malformed JSON", async () => {
		const res = await fetch(`${base}/addTodo`, {
			method: "POST",
			body: "{nope",
		});
		expect(res.status).toBe(400);
	});

	it("responds 404 when the method is unknown", async () => {
		const res = await fetch(`${base}/nope`, { method: "POST", body: "{}" });
		expect(res.status).toBe(404);
	});

	it("responds 405 when the verb is wrong for the method", async () => {
		const res = await fetch(`${base}/getTodo`, { method: "POST", body: "{}" });
		expect(res.status).toBe(405);
	});

	it("rejects with a 500 that leaks nothing when a handler throws", async () => {
		const err = await client.call("boom", {}).catch((error: unknown) => error);
		expect(err).toBeInstanceOf(RpcError);
		expect((err as RpcError).status).toBe(500);
		expect((err as RpcError).message).toBe("boom: internal error");
	});

	it("rejects with the status and message when a handler throws an RpcError", async () => {
		const err = await client
			.call("secret", {})
			.catch((error: unknown) => error);
		expect((err as RpcError).status).toBe(403);
		expect((err as RpcError).message).toBe("secret: not yours");
	});

	it("rejects when the signal is already aborted", async () => {
		expect(
			client.call("getTodo", { id: 1 }, { signal: AbortSignal.abort() }),
		).rejects.toThrow();
	});

	it("dispatches to the handler when mounted under a path prefix", async () => {
		const res = await service.fetch(
			new Request(
				`http://mounted/api/v1/getTodo?input=${encodeURIComponent('{"id":3}')}`,
			),
		);
		expect(await res.json()).toEqual({ title: "todo 3" });
	});

	it("rejects preflights by default and answers them when cors is enabled", async () => {
		expect(
			(await service.fetch(new Request(`${base}/boom`, { method: "OPTIONS" })))
				.status,
		).toBe(405);

		const open = new Service(contract, handlers, { cors: "https://app.test" });
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

	it("fails to compile when an input has the wrong type", () => {
		// @ts-expect-error title must be a string
		const bad = () => client.call("addTodo", { title: 42 });
		expect(bad).toBeInstanceOf(Function);
	});
});
