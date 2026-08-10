import { afterAll, expect, test } from "bun:test";
import { t } from "@webappwiz/t";

import { Client, type Contract, Server } from "./index";

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
} satisfies Contract;

const server = new Server(contract, {
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
		throw new Error("kaboom");
	},
});
const base = `http://localhost:${server.listen(0)}`;
const client = new Client(contract, base);

afterAll(() => server.stop());

test("mutation round-trips over POST", async () => {
	const { id } = await client.call("addTodo", { title: "milk" });
	expect(id).toBe(4);
});

test("query round-trips over GET", async () => {
	const { title } = await client.call("getTodo", { id: 7 });
	expect(title).toBe("todo 7");
});

test("handlers set response headers", async () => {
	const res = await fetch(
		`${base}/getTodo?input=${encodeURIComponent('{"id":1}')}`,
	);
	expect(res.status).toBe(200);
	expect(res.headers.get("cache-control")).toBe("max-age=60");
});

test("request headers merge, per-call over constructor, and reach handlers", async () => {
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

test("schema failures are 400 with a field path", async () => {
	const res = await fetch(`${base}/addTodo`, {
		method: "POST",
		body: JSON.stringify({ title: 42 }),
	});
	expect(res.status).toBe(400);
	expect(await res.text()).toBe("title: expected string");
});

test("malformed JSON is 400", async () => {
	const res = await fetch(`${base}/addTodo`, { method: "POST", body: "{nope" });
	expect(res.status).toBe(400);
});

test("unknown methods are 404", async () => {
	const res = await fetch(`${base}/nope`, { method: "POST", body: "{}" });
	expect(res.status).toBe(404);
});

test("wrong verb for a method is 405", async () => {
	const res = await fetch(`${base}/getTodo`, { method: "POST", body: "{}" });
	expect(res.status).toBe(405);
});

test("handler throws surface as 500 through the client", async () => {
	expect(client.call("boom", {})).rejects.toThrow("boom: 500 kaboom");
});

test("inputs are compile-time checked", () => {
	// @ts-expect-error title must be a string
	const bad = () => client.call("addTodo", { title: 42 });
	expect(bad).toBeInstanceOf(Function);
});
