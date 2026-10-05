import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Duration } from "webappwiz/time";
import { FakeTimer } from "webappwiz/time/testing";
import { Clef } from "./clef";
import { Jev } from "./jev";
import type { Judgment } from "./judge";

describe("Clef and Jev", () => {
	let server: ReturnType<typeof Bun.serve>;
	let origin: string;
	let received: { path: string; auth: string | null; body: unknown }[];
	let reply: Response;
	/** Answered in turn before `reply`, which answers the rest. */
	let replies: Response[];
	let timer: FakeTimer;

	const judgment: Judgment = {
		state: { path: "a.ts" },
		questions: { q0: { type: "noul", instructions: "Is it?" } },
	};

	beforeEach(() => {
		received = [];
		reply = Response.json({});
		replies = [];
		timer = new FakeTimer();
		server = Bun.serve({
			port: 0,
			fetch: async (request) => {
				received.push({
					path: new URL(request.url).pathname,
					auth: request.headers.get("authorization"),
					body: await request.json(),
				});
				return (replies.shift() ?? reply).clone();
			},
		});
		origin = `http://localhost:${server.port}`;
	});

	afterEach(() => {
		server.stop(true);
	});

	/** Settles once the next retry is scheduled, for a test to act while it waits. */
	const scheduled = async (): Promise<void> => {
		while (timer.timeouts.length === 0) {
			await Bun.sleep(0);
		}
	};

	/** The wait before the next retry, once one is scheduled, and then its end, so no test waits in real time. */
	const retried = async (): Promise<Duration> => {
		await scheduled();
		const delay = timer.timeouts[0]?.delay;
		timer.fireTimeouts();
		if (delay === undefined) {
			throw new Error("no retry was scheduled");
		}
		return delay;
	};

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

	it("asks again after a 429, once the wait its Retry-After asks for is over", async () => {
		replies = [
			Response.json(
				{ errors: [{ message: "Capacity temporarily exceeded" }] },
				{ status: 429, headers: { "retry-after": "2" } },
			),
		];
		reply = Response.json({ result: { answers: { q0: 0.4 } } });
		const clef = new Clef(
			"clef",
			{ id: "acct", token: "cf-token" },
			{ origin, timer },
		);

		const verdict = clef.judge(judgment);

		expect((await retried()).ms).toBe(2000);
		expect(await verdict).toEqual({ answers: new Map([["q0", 0.4]]) });
		expect(received).toHaveLength(2);
	});

	it("backs off on a 5xx, doubling with jitter, and lets the refusal stand after four tries", async () => {
		reply = Response.json({ error: "overloaded" }, { status: 503 });
		const jev = new Jev("jev-latest", "ts-key", { origin, timer });

		const verdict = jev.judge(judgment);
		const first = await retried();
		const second = await retried();
		const third = await retried();

		await expect(verdict).rejects.toThrow(
			/^jev-latest answered 503: overloaded$/,
		);
		expect(received).toHaveLength(4);
		expect(first.ms).toBeWithin(500, 1001);
		expect(second.ms).toBeWithin(1000, 2001);
		expect(third.ms).toBeWithin(2000, 4001);
	});

	it("stops waiting to ask again when the signal aborts", async () => {
		reply = Response.json({ error: "busy" }, { status: 429 });
		const clef = new Clef(
			"clef",
			{ id: "acct", token: "cf-token" },
			{ origin, timer },
		);
		const controller = new AbortController();

		const verdict = clef.judge(judgment, { signal: controller.signal });
		await scheduled();
		controller.abort(new Error("stopped"));

		await expect(verdict).rejects.toThrow("stopped");
		expect([timer.timeouts[0]?.disposed, received.length]).toEqual([true, 1]);
	});
});
