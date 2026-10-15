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

		expect(await sequence.clean("one")).toEqual({
			text: "three",
			edits: [],
			applied: [],
		});
	});

	it("carries an earlier edit to where its span moved", async () => {
		const sequence = new CleanupSequence(
			replacing("x", "x", { edits: tagOn("scry") }),
			replacing("do ", "first, please do "),
		);

		const { text, edits } = await sequence.clean("do scry now");

		expect(text).toBe("first, please do scry now");
		expect(edits).toEqual(tagOn("scry")(text));
	});

	it("carries a span a later cleanup only capitalized", async () => {
		const sequence = new CleanupSequence(
			replacing("x", "x", { edits: tagOn("scry") }),
			replacing("I want: scry", "I want:\n- Scry"),
		);

		const { text, edits } = await sequence.clean("I want: scry it");

		expect(text).toBe("I want:\n- Scry it");
		expect(edits).toMatchObject([{ start: 10, end: 14 }]);
		expect(text.slice(10, 14)).toBe("Scry");
	});

	it("drops an earlier edit whose span a later cleanup rewrote", async () => {
		const sequence = new CleanupSequence(
			replacing("x", "x", { edits: tagOn("scry") }),
			replacing("scry", "sky", { edits: tagOn("now") }),
		);

		const { text, edits } = await sequence.clean("do scry now");

		expect(text).toBe("do sky now");
		expect(edits).toEqual(tagOn("now")(text));
	});

	it("reports what a cleanup changed, with the words it replaced", async () => {
		const sequence = new CleanupSequence(
			replacing("um, ", "", { kind: "filler" }),
			replacing("s cry", "#scry", { kind: "tag" }),
		);

		const { text, applied } = await sequence.clean("so um, use s cry");

		expect(text).toBe("so use #scry");
		expect(applied).toEqual([
			{ type: "filler", start: 3, end: 3, was: "um, " },
			{ type: "tag", start: 7, end: 12, was: "s cry" },
		]);
	});

	it("takes back a capital a drop made by putting the words back", async () => {
		const sequence = new CleanupSequence(
			replacing("Um, we", "We", { kind: "filler" }),
		);

		const { text, applied } = await sequence.clean("Um, we go");

		expect(text).toBe("We go");
		expect(applied).toEqual([
			{ type: "filler", start: 0, end: 2, was: "Um, we" },
		]);
	});

	it("carries an applied edit as it carries an open one", async () => {
		const sequence = new CleanupSequence(
			replacing("s cry", "#scry", { kind: "tag" }),
			replacing("do ", "first, please do ", { kind: "item" }),
		);

		const { text, applied } = await sequence.clean("do s cry now");

		expect(text).toBe("first, please do #scry now");
		expect(applied?.filter((edit) => edit.type === "tag")).toEqual([
			{ type: "tag", start: 17, end: 22, was: "s cry" },
		]);
		expect(text.slice(17, 22)).toBe("#scry");
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

		expect(await sequence.clean("one")).toEqual({
			text: "two",
			edits: [],
			applied: [],
		});
	});
});

/** A cleanup that swaps `from` for `to` and leaves `edits` open on the result. */
function replacing(
	from: string,
	to: string,
	{
		edits = () => [],
		kind,
	}: {
		edits?: (text: string) => DictationEdit[];
		kind?: DictationEdit["type"];
	} = {},
): Cleanup {
	return {
		kind,
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
