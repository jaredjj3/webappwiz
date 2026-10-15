import { beforeEach, describe, expect, it } from "bun:test";
import type { Answer } from "webappwiz/decide";
import { FakeDecider } from "webappwiz/decide/testing";
import { CorrectionDropper } from "./correction-dropper";
import { CORRECTION_FIXTURES } from "./fixtures";

describe("CorrectionDropper", () => {
	let decider: FakeDecider;
	beforeEach(() => {
		decider = new FakeDecider();
	});

	it.each(CORRECTION_FIXTURES)("drops $name", async (fixture) => {
		decider.answers = fixture.answers;

		const { text, edits } = await new CorrectionDropper(decider).clean(
			fixture.said,
		);

		expect(text).toBe(fixture.text);
		expect(edits).toEqual(fixture.edits);
	});

	it("drops a sentence said again, with its cue, keeping the newer wording", async () => {
		decider.answers = {
			"correction.1": role({ replaces: 0.95, neither: 0.05 }),
		};

		const { text } = await new CorrectionDropper(decider).clean(
			"Send it to Bob. Actually, no, send it to Alice.",
		);

		expect(text).toBe("Send it to Alice.");
	});

	it("drops only the words an amend says again", async () => {
		decider.answers = { "correction.1": role({ amends: 0.95, neither: 0.05 }) };

		const { text } = await new CorrectionDropper(decider).clean(
			"The meeting is on Tuesday, I mean Wednesday, at noon.",
		);

		expect(text).toBe("The meeting is on Wednesday, at noon.");
	});

	it("amends from the last word the newer wording opens with", async () => {
		decider.answers = { "correction.1": role({ amends: 0.95 }) };

		const { text } = await new CorrectionDropper(decider).clean(
			"Fix the footer. I mean the header.",
		);

		expect(text).toBe("Fix the header.");
	});

	it("drops a retraction with what it retracts", async () => {
		decider.answers = { "correction.1": role({ replaces: 0.95 }) };

		const { text } = await new CorrectionDropper(decider).clean(
			"Add a retry. Scratch that. log every failure.",
		);

		expect(text).toBe("Log every failure.");
	});

	it("drops a chain of corrections down to the last", async () => {
		decider.answers = {
			"correction.1": role({ replaces: 0.95 }),
			"correction.2": role({ replaces: 0.95 }),
		};

		const { text } = await new CorrectionDropper(decider).clean(
			"Use red. No, blue. Wait, use green.",
		);

		expect(text).toBe("Use green.");
	});

	it("offers an unsure correction as an edit", async () => {
		decider.answers = { "correction.1": role({ replaces: 0.5, neither: 0.5 }) };

		const { text, edits } = await new CorrectionDropper(decider).clean(
			"Send it to Bob. Actually, send it to Alice.",
		);

		expect(text).toBe("Send it to Bob. Actually, send it to Alice.");
		expect(edits).toEqual([
			{ type: "correction", start: 0, end: 27, text: "S", probability: 0.5 },
		]);
		expect(text.slice(0, 27)).toBe("Send it to Bob. Actually, s");
	});

	it("keeps what takes nothing back", async () => {
		decider.answers = { "correction.1": role({ neither: 0.9, replaces: 0.1 }) };
		const said = "Ship it today. Actually, the docs need updating too.";

		expect(await new CorrectionDropper(decider).clean(said)).toEqual({
			text: said,
			edits: [],
		});
	});

	it("asks nothing of a take with no cue, nor of a no that opens no correction", async () => {
		const said = "No one uses the old route. It can go.";

		expect(await new CorrectionDropper(decider).clean(said)).toEqual({
			text: said,
			edits: [],
		});
		expect(decider.asked).toEqual([]);
	});

	it("asks nothing of a cue that answers a question", async () => {
		const said = "Did the tests pass? No, two of them failed.";

		expect(await new CorrectionDropper(decider).clean(said)).toEqual({
			text: said,
			edits: [],
		});
		expect(decider.asked).toEqual([]);
	});

	it("drops nothing of a retraction with nothing before it but the take itself", async () => {
		decider.answers = { "correction.1": role({ replaces: 1 }) };
		const said = "Actually, A, sorry.";

		expect(await new CorrectionDropper(decider).clean(said)).toEqual({
			text: said,
			edits: [],
		});
	});

	it("asks nothing of a cue after a list number, and keeps the number", async () => {
		const said = "1. Yes. 2. No, use the second one.";

		expect(await new CorrectionDropper(decider).clean(said)).toEqual({
			text: said,
			edits: [],
		});
		expect(decider.asked).toEqual([]);
	});

	it("asks nothing of a cue after a lone cue", async () => {
		const said = "Actually, sorry, send it today.";

		expect(await new CorrectionDropper(decider).clean(said)).toEqual({
			text: said,
			edits: [],
		});
		expect(decider.asked).toEqual([]);
	});

	it("amends when the newer wording is too short to say the segment again", async () => {
		decider.answers = { "correction.1": role({ replaces: 0.6, amends: 0.35 }) };

		const { text } = await new CorrectionDropper(decider).clean(
			"The meeting is on Tuesday, I mean Wednesday, at noon.",
		);

		expect(text).toBe("The meeting is on Wednesday, at noon.");
	});

	it("asks about each cued segment, in one request", async () => {
		decider.answers = {
			"correction.1": role({ neither: 1 }),
			"correction.2": role({ neither: 1 }),
		};

		await new CorrectionDropper(decider).clean(
			"Meet at three, no wait, four. Sorry, at five.",
		);

		expect(decider.asked).toHaveLength(1);
		expect(decider.asked[0]?.state).toBe(
			"S0| Meet at three,\nS1| no wait, four.\nS2| Sorry, at five.",
		);
		expect(Object.keys(decider.asked[0]?.questions ?? {})).toEqual([
			"correction.1",
			"correction.2",
		]);
	});
});

/** A Choice on what a cued segment does, answered with `probabilities`. */
function role(probabilities: Record<string, number>): Answer {
	return { type: "choice", choice: "", probabilities, confidence: 1 };
}
