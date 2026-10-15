import { describe, expect, it } from "bun:test";
import { CleanupSequence } from "./cleanup-sequence";
import type { Cleaned, DictationEdit } from "./dictation-message";
import type { Cleanup } from "./dictation-relay";

describe("CleanupSequence", () => {
	it("runs each cleanup on the text the one before left", async () => {
		const sequence = new CleanupSequence(
			replacing("one", "two"),
			replacing("two", "three"),
		);

		expect(await sequence.clean("one")).toEqual({ text: "three", edits: [] });
	});

	it("carries an earlier edit to where its span moved", async () => {
		const sequence = new CleanupSequence(
			replacing("x", "x", tagOn("scry")),
			replacing("do ", "first, please do "),
		);

		const { text, edits } = await sequence.clean("do scry now");

		expect(text).toBe("first, please do scry now");
		expect(edits).toEqual(tagOn("scry")(text));
	});

	it("carries a span a later cleanup only capitalized", async () => {
		const sequence = new CleanupSequence(
			replacing("x", "x", tagOn("scry")),
			replacing("I want: scry", "I want:\n- Scry"),
		);

		const { text, edits } = await sequence.clean("I want: scry it");

		expect(text).toBe("I want:\n- Scry it");
		expect(edits).toMatchObject([{ start: 10, end: 14 }]);
		expect(text.slice(10, 14)).toBe("Scry");
	});

	it("drops an earlier edit whose span a later cleanup rewrote", async () => {
		const sequence = new CleanupSequence(
			replacing("x", "x", tagOn("scry")),
			replacing("scry", "sky", tagOn("now")),
		);

		const { text, edits } = await sequence.clean("do scry now");

		expect(text).toBe("do sky now");
		expect(edits).toEqual(tagOn("now")(text));
	});

	it("skips a cleanup that throws and runs the rest", async () => {
		const sequence = new CleanupSequence(
			{
				clean: async () => {
					throw new Error("no creds");
				},
			},
			replacing("one", "two"),
		);

		expect(await sequence.clean("one")).toEqual({ text: "two", edits: [] });
	});
});

/** A cleanup that swaps `from` for `to` and leaves `edits` open on the result. */
function replacing(
	from: string,
	to: string,
	edits: (text: string) => DictationEdit[] = () => [],
): Cleanup {
	return {
		clean: async (text): Promise<Cleaned> => {
			const replaced = text.replace(from, to);
			return { text: replaced, edits: edits(replaced) };
		},
	};
}

/** Tag edits on the first `word` in a text. */
function tagOn(word: string): (text: string) => DictationEdit[] {
	return (text) => [
		{
			type: "tag",
			start: text.indexOf(word),
			end: text.indexOf(word) + word.length,
			system: word,
			probability: 0.5,
		},
	];
}
