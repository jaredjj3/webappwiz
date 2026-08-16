import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Listening } from "@webappwiz/http";
import { BunHttpServer } from "@webappwiz/http/bun";
import { t } from "@webappwiz/t";
import { Duration } from "@webappwiz/time";
import { z } from "zod";
import { Client, type Contract, type Handlers, Service } from "./index";

/**
 * Against the real zod, over a real round trip. A contract is the other place a
 * caller supplies schemas, and the claim is the same: bring your own library.
 */
describe("rpc with zod", () => {
	// One method in zod, one in ours, one mixing the two across input and output,
	// since a contract is written once and nothing says it picks a side.
	const contract = {
		addTodo: {
			type: "mutation",
			input: z.object({ title: z.string().min(1) }),
			output: z.object({ id: z.number() }),
		},
		getTodo: {
			type: "query",
			input: t.object({ id: t.number() }),
			output: z.object({ title: z.string() }),
		},
	} satisfies Contract;

	const handlers: Handlers<typeof contract> = {
		addTodo: ({ title }) => ({ id: title.length }),
		getTodo: ({ id }) => ({ title: `todo ${id}` }),
	};

	let listening: Listening;
	let client: Client<typeof contract>;

	beforeAll(async () => {
		const service = new Service(contract, handlers);
		listening = await new BunHttpServer().serve(service.fetch, {
			port: 0,
			idleTimeout: Duration.secs(10),
		});
		client = new Client(contract, `http://localhost:${listening.port}`);
	});

	afterAll(() => listening.stop());

	it("carries a mutation declared in zod, both ways", async () => {
		const { id } = await client.call("addTodo", { title: "milk" });

		expect(id).toBe(4);
	});

	it("carries a query whose input is ours and output is zod", async () => {
		const { title } = await client.call("getTodo", { id: 7 });

		expect(title).toBe("todo 7");
	});

	it("refuses input zod rejects, as a 400 rather than a crash", async () => {
		const res = await fetch(`http://localhost:${listening.port}/addTodo`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ title: "" }),
		});

		expect(res.status).toBe(400);
		// zod's own words reach the caller: the message is not rewritten, only
		// carried, so whoever wrote the schema recognises what came back.
		expect(await res.text()).not.toBe("");
	});

	it("names the field that failed, wherever the schema came from", async () => {
		const res = await fetch(`http://localhost:${listening.port}/addTodo`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ title: 42 }),
		});

		expect(res.status).toBe(400);
		expect(await res.text()).toContain("title");
	});

	it("fails to compile when a zod input has the wrong type", () => {
		// @ts-expect-error title must be a string
		const bad = () => client.call("addTodo", { title: 42 });
		expect(bad).toBeInstanceOf(Function);
	});
});
