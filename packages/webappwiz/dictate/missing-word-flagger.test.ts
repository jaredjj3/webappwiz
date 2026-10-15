import { beforeEach, describe, expect, it } from "bun:test";
import type { Answer } from "webappwiz/decide";
import { FakeDecider } from "webappwiz/decide/testing";
import { MISSING_FIXTURES } from "./fixtures";
import { MissingWordFlagger } from "./missing-word-flagger";

describe("MissingWordFlagger", () => {
	let decider: FakeDecider;
	beforeEach(() => {
		decider = new FakeDecider();
	});

	it.each(MISSING_FIXTURES)("flags $name", async (fixture) => {
		decider.answers = fixture.answers;

		const { text, edits } = await new MissingWordFlagger(decider).clean(
			fixture.said,
		);

		expect(text).toBe(fixture.text);
		expect(edits).toEqual(fixture.edits);
	});

	it("flags a sentence the model thinks lost a word, leaving the text alone", async () => {
		decider.answers = { "missing.0": yes, "missing.1": no };
		const said = "Push the fix staging. It works fine now.";

		const { text, edits } = await new MissingWordFlagger(decider).clean(said);

		expect(text).toBe(said);
		expect(edits).toEqual([
			{ type: "missing", start: 0, end: 21, probability: 0.95 },
		]);
	});

	it("asks once for all the sentences, skipping those too short to judge", async () => {
		decider.answers = { "missing.0": no };

		await new MissingWordFlagger(decider).clean(
			"Yes. Push the fix to staging.",
		);

		expect(decider.asked).toHaveLength(1);
		expect(Object.keys(decider.asked[0]?.questions ?? {})).toEqual([
			"missing.0",
		]);
	});

	it("asks nothing of a take with no sentence long enough", async () => {
		const { edits } = await new MissingWordFlagger(decider).clean("Yes, go.");

		expect(edits).toEqual([]);
		expect(decider.asked).toEqual([]);
	});

	it("leaves a sentence the model is only unsure of", async () => {
		decider.answers = { "missing.0": { type: "noul", noul: 0.5 } };

		const { edits } = await new MissingWordFlagger(decider).clean(
			"Push the fix staging.",
		);

		expect(edits).toEqual([]);
	});
});

const yes: Answer = { type: "noul", noul: 0.95 };
const no: Answer = { type: "noul", noul: 0.05 };
