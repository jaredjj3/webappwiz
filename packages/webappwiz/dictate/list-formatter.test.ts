import { beforeEach, describe, expect, it } from "bun:test";
import type { Answer } from "webappwiz/decide";
import { FakeDecider } from "webappwiz/decide/testing";
import { LIST_FIXTURES } from "./fixtures";
import { ListFormatter } from "./list-formatter";

describe("ListFormatter", () => {
	let decider: FakeDecider;
	beforeEach(() => {
		decider = new FakeDecider();
	});

	it.each(LIST_FIXTURES)("formats $name", async (fixture) => {
		decider.answers = fixture.answers;

		const { text, edits } = await new ListFormatter(decider).clean(
			fixture.said,
		);

		expect(text).toBe(fixture.text);
		expect(edits).toEqual(fixture.edits);
	});

	it("joins an unsure item to the one before, with an edit to split it off", async () => {
		const said =
			"A few bugs. The handle hides. Todos lose their lane. Also, the badge sticks. Thanks.";
		decider.answers = {
			"kind.0": kind({ intro: 0.9, prose: 0.1 }),
			"kind.1": kind({ item: 0.9, prose: 0.1 }),
			"kind.2": kind({ item: 0.9, prose: 0.1 }),
			"kind.3": kind({ item: 0.5, continues: 0.3, prose: 0.2 }),
			"kind.4": kind({ item: 0.05, prose: 0.95 }),
			"step.0": noul,
			"step.1": noul,
			"step.2": noul,
			"step.3": noul,
			"step.4": noul,
		};

		const { text, edits } = await new ListFormatter(decider).clean(said);

		expect(text).toBe(
			"A few bugs:\n- The handle hides\n- Todos lose their lane. Also, the badge sticks.\n\nThanks.",
		);
		expect(edits).toEqual([
			{ type: "item", start: 54, end: 63, text: "\n- T", probability: 0.5 },
		]);
		expect(text.slice(54, 63)).toBe(". Also, t");
	});

	it("asks nothing of a sentence or two with no cue word", async () => {
		const said = "Fix the header. It overlaps the menu.";

		expect(await new ListFormatter(decider).clean(said)).toEqual({
			text: said,
			edits: [],
		});
		expect(decider.asked).toEqual([]);
	});

	it("asks what each segment does, and whether it is a step, in one request", async () => {
		decider.answers = {
			"kind.0": kind({ prose: 1 }),
			"kind.1": kind({ prose: 1 }),
			"step.0": noul,
			"step.1": noul,
		};

		await new ListFormatter(decider).clean("Fix it, then test it.");

		expect(decider.asked).toHaveLength(1);
		expect(decider.asked[0]?.state).toBe("S0| Fix it,\nS1| then test it.");
		const asked = decider.asked[0]?.questions ?? {};
		expect(Object.keys(asked)).toEqual([
			"kind.0",
			"step.0",
			"kind.1",
			"step.1",
		]);
		expect(Object.keys(asked["kind.0"]?.criteria ?? {})).toEqual([
			"intro",
			"item",
			"prose",
		]);
		expect(Object.keys(asked["kind.1"]?.criteria ?? {})).toEqual([
			"intro",
			"item",
			"continues",
			"prose",
		]);
	});
});

/** A step Noul answered no. */
const noul: Answer = { type: "noul", noul: 0 };

/** A Choice on what a segment does, answered with `probabilities`. */
function kind(probabilities: Record<string, number>): Answer {
	return { type: "choice", choice: "", probabilities, confidence: 1 };
}
