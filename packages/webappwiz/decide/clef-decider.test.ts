import { beforeEach, describe, expect, it } from "bun:test";
import { ClefDecider } from "./clef-decider";
import type { Question } from "./decider";

describe("ClefDecider", () => {
	let questions: Record<string, Question>;
	let sizes: number[];
	let urls: string[];
	let decider: ClefDecider;

	beforeEach(() => {
		const question: Question = { type: "noul", instructions: "Is it?" };
		questions = Object.fromEntries(
			Array.from({ length: 150 }, (_, i) => [`q${i}`, question]),
		);
		sizes = [];
		urls = [];
		const cloudflare = (async (url: string, init: RequestInit) => {
			urls.push(url);
			const body = JSON.parse(init.body as string);
			sizes.push(Object.keys(body.questions).length);
			return Response.json({
				success: true,
				errors: [],
				result: {
					answers: Object.fromEntries(
						Object.keys(body.questions).map((id) => [
							id,
							{ type: "noul", noul: 0.5 },
						]),
					),
					usage: { input_tokens: 1_000_000, output_tokens: 0 },
				},
			});
		}) as unknown as typeof fetch;
		decider = new ClefDecider("acct", "token", {
			model: "clef-flash",
			fetch: cloudflare,
		});
	});

	it("splits 150 questions into requests of at most 64", async () => {
		const decision = await decider.decide("state", questions);

		expect(sizes.sort((left, right) => left - right)).toEqual([22, 64, 64]);
		expect(urls[0]).toBe(
			"https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/cloudflare/clef-flash",
		);
		expect(Object.keys(decision.answers)).toHaveLength(150);
	});

	it("sums the tokens and cost over the requests", async () => {
		const { cost } = await decider.decide("state", questions);

		expect(cost.inputTokens).toBe(3_000_000);
		expect(cost.dollars).toBeCloseTo(3 * 0.038);
	});

	it("fails when Workers AI reports an error", async () => {
		const failing = (async () =>
			Response.json({
				success: false,
				errors: [{ message: "bad token" }],
			})) as unknown as typeof fetch;
		const bad = new ClefDecider("acct", "token", { fetch: failing });
		await expect(bad.decide("x", questions)).rejects.toThrow("bad token");
	});
});
