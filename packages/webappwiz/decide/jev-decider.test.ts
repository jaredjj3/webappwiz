import { beforeEach, describe, expect, it } from "bun:test";
import { Duration } from "webappwiz/time";
import { FakeClock } from "webappwiz/time/testing";
import type { Question } from "./decider";
import { JevDecider } from "./jev-decider";

describe("JevDecider", () => {
	let urgent: Question;
	let clock: FakeClock;
	let seen: { headers: Headers; body: unknown } | undefined;
	let decider: JevDecider;

	beforeEach(() => {
		urgent = { type: "noul", instructions: "Is it urgent?" };
		clock = new FakeClock();
		seen = undefined;
		const fetcher = (async (_url: string, init: RequestInit) => {
			seen = {
				headers: new Headers(init.headers),
				body: JSON.parse(init.body as string),
			};
			clock.advance(Duration.ms(250));
			return Response.json({
				model: "jev-1.13.0",
				answers: { urgent: { type: "noul", noul: 0.9 } },
				usage: { input_tokens: 1_000_000, output_tokens: 20 },
			});
		}) as unknown as typeof fetch;
		decider = new JevDecider("key", { fetch: fetcher, clock });
	});

	it("posts the state and questions with the key", async () => {
		const decision = await decider.decide("Help!", { urgent });

		expect(seen?.headers.get("authorization")).toBe("Bearer key");
		expect(seen?.body).toEqual({
			model: "jev-latest",
			state: "Help!",
			questions: { urgent },
		});
		expect(decision.answers.urgent).toEqual({ type: "noul", noul: 0.9 });
	});

	it("reports the latency, tokens and input cost", async () => {
		const { cost } = await decider.decide("Help!", { urgent });

		expect(cost.latency.ms).toBe(250);
		expect(cost.inputTokens).toBe(1_000_000);
		expect(cost.dollars).toBeCloseTo(0.042);
	});

	it("fails with the status when the server refuses", async () => {
		const refusing = (async () =>
			new Response("nope", { status: 401 })) as unknown as typeof fetch;
		const bad = new JevDecider("bad", { fetch: refusing });
		await expect(bad.decide("x", { urgent })).rejects.toMatchObject({
			status: 401,
		});
	});
});
