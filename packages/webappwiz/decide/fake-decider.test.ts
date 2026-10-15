import { describe, expect, it } from "bun:test";
import { FakeDecider } from "./fake-decider";

describe("FakeDecider", () => {
	it("answers from what was set and remembers the question", async () => {
		const decider = new FakeDecider();
		decider.answers.urgent = { type: "noul", noul: 1 };
		const question = { type: "noul", instructions: "?" } as const;
		const decision = await decider.decide("s", { urgent: question });
		expect(decision.answers.urgent).toEqual({ type: "noul", noul: 1 });
		expect(decider.asked).toEqual([
			{ state: "s", questions: { urgent: question } },
		]);
	});
});
