import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Clef } from "./clef";
import { Jev } from "./jev";
import type { Judgment } from "./judge";

describe("Clef and Jev", () => {
	let server: ReturnType<typeof Bun.serve>;
	let origin: string;
	let received: { path: string; auth: string | null; body: unknown }[];
	let reply: Response;

	const judgment: Judgment = {
		state: { path: "a.ts" },
		questions: { q0: { type: "noul", instructions: "Is it?" } },
	};

	beforeEach(() => {
		received = [];
		reply = Response.json({});
		server = Bun.serve({
			port: 0,
			fetch: async (request) => {
				received.push({
					path: new URL(request.url).pathname,
					auth: request.headers.get("authorization"),
					body: await request.json(),
				});
				return reply.clone();
			},
		});
		origin = `http://localhost:${server.port}`;
	});

	afterEach(() => {
		server.stop(true);
	});

	it("asks Clef on Workers AI, and reads Cloudflare's wrapped reply", async () => {
		reply = Response.json({
			success: true,
			errors: [],
			result: { model: "clef-flash", answers: { q0: 0.87 } },
		});
		const clef = new Clef(
			"clef-flash",
			{ id: "acct", token: "cf-token" },
			{ origin },
		);

		const verdict = await clef.judge(judgment);

		expect(received).toEqual([
			{
				path: "/client/v4/accounts/acct/ai/run/@cf/cloudflare/clef-flash",
				auth: "Bearer cf-token",
				body: judgment,
			},
		]);
		expect(verdict).toEqual({ answers: new Map([["q0", 0.87]]) });
	});

	it("asks Jev at /v1/systemone with its model, and reads typed answers and usage", async () => {
		reply = Response.json({
			model: "jev-1.13.0",
			answers: { q0: { type: "noul", noul: 0.93 } },
			usage: { input_tokens: 412, output_tokens: 0 },
		});
		const jev = new Jev("jev-latest", "ts-key", { origin });

		const verdict = await jev.judge(judgment);

		expect(received).toEqual([
			{
				path: "/v1/systemone",
				auth: "Bearer ts-key",
				body: { model: "jev-latest", ...judgment },
			},
		]);
		expect(verdict).toEqual({ answers: new Map([["q0", 0.93]]), input: 412 });
	});

	it("says what went wrong when the provider refuses", async () => {
		reply = Response.json(
			{
				success: false,
				errors: [{ code: 10000, message: "Authentication error" }],
			},
			{ status: 401 },
		);
		const clef = new Clef("clef", { id: "acct", token: "bad" }, { origin });

		// by its name, not its URL, which holds the account id
		await expect(clef.judge(judgment)).rejects.toThrow(
			/^clef answered 401: Authentication error$/,
		);
	});

	it("refuses a reply with no answers in it", async () => {
		reply = Response.json({ ok: true });
		const jev = new Jev("jev-latest", "ts-key", { origin });

		await expect(jev.judge(judgment)).rejects.toThrow(
			/^jev-latest answered with no answers in it$/,
		);
	});
});
