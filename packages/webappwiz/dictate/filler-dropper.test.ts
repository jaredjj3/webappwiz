import { beforeEach, describe, expect, it } from "bun:test";
import type { Answer } from "webappwiz/decide";
import { FakeDecider } from "webappwiz/decide/testing";
import { FillerDropper } from "./filler-dropper";
import { FILLER_FIXTURES } from "./fixtures";

describe("FillerDropper", () => {
	let decider: FakeDecider;
	beforeEach(() => {
		decider = new FakeDecider();
	});

	it.each(FILLER_FIXTURES)("drops $name", async (fixture) => {
		decider.answers = fixture.answers;

		const { text, edits } = await new FillerDropper(decider).clean(
			fixture.said,
		);

		expect(text).toBe(fixture.text);
		expect(edits).toEqual(fixture.edits);
	});

	it("tells the model a like that compares or reports a feeling is no filler", async () => {
		decider.answers = { "filler.0": no, "filler.1": no };

		const said = "I feel like nothing is happening. Something like trello.";
		const { text } = await new FillerDropper(decider).clean(said);

		expect(text).toBe(said);
		expect(JSON.stringify(decider.asked[0]?.questions)).toMatch(
			/something like trello.*I feel like nothing|I feel like nothing.*something like trello/su,
		);
	});

	it("drops um and uh without asking", async () => {
		const { text } = await new FillerDropper(decider).clean(
			"Um, the build is, uh, broken.",
		);

		expect(text).toBe("The build is broken.");
		expect(decider.asked).toEqual([]);
	});

	it("drops filler with the punctuation it leaves behind", async () => {
		decider.answers = {
			"filler.0": yes,
			"filler.1": yes,
			"filler.2": yes,
			"filler.3": yes,
			"filler.4": yes,
		};

		const { text } = await new FillerDropper(decider).clean(
			"So, I was, like, tired and like it broke, you know. I mean it works.",
		);

		expect(text).toBe("I was tired and it broke. It works.");
	});

	it("drops fillers that share a comma, opening the sentence on what stays", async () => {
		decider.answers = { "filler.0": yes, "filler.1": yes, "filler.2": yes };

		const { text } = await new FillerDropper(decider).clean(
			"So, um, I was like, really tired, you know.",
		);

		expect(text).toBe("I was really tired.");
	});

	it("offers an unsure filler beside a sure one, spanning the text left", async () => {
		decider.answers = {
			"filler.0": { type: "noul", noul: 0.5 },
			"filler.1": no,
			"filler.2": no,
		};

		const { text, edits } = await new FillerDropper(decider).clean(
			"So, um, I was like, really tired, you know.",
		);

		expect(text).toBe("So I was like, really tired, you know.");
		expect(edits).toEqual([
			{ type: "filler", start: 0, end: 3, text: "", probability: 0.5 },
		]);
	});

	it("drops a filler that ends a sentence with the space before it", async () => {
		decider.answers = { "filler.0": yes };

		const { text } = await new FillerDropper(decider).clean(
			"It was fast like.",
		);

		expect(text).toBe("It was fast.");
	});

	it("keeps a word that carries meaning", async () => {
		decider.answers = { "filler.0": no };
		const said = "I was tired like a dog.";

		expect(await new FillerDropper(decider).clean(said)).toEqual({
			text: said,
			edits: [],
		});
	});

	it("offers an unsure filler as an edit", async () => {
		decider.answers = { "filler.0": { type: "noul", noul: 0.5 } };

		const { text, edits } = await new FillerDropper(decider).clean(
			"The badge is kind of red.",
		);

		expect(text).toBe("The badge is kind of red.");
		expect(edits).toEqual([
			{ type: "filler", start: 13, end: 21, text: "", probability: 0.5 },
		]);
		expect(text.slice(13, 21)).toBe("kind of ");
	});

	it("asks about each word in its sentence, in one request", async () => {
		decider.answers = { "filler.0": no, "filler.1": no };

		await new FillerDropper(decider).clean(
			"Fix it. It looks like a warning, so we should. Done.",
		);

		expect(decider.asked).toHaveLength(1);
		const questions = decider.asked[0]?.questions ?? {};
		expect(questions["filler.0"]?.instructions).toBe(
			'Is the bracketed "like" in "It looks [like] a warning, so we should." filler, which the sentence says the same without?',
		);
		expect(Object.keys(questions)).toEqual(["filler.0", "filler.1"]);
	});
});

const yes: Answer = { type: "noul", noul: 0.95 };
const no: Answer = { type: "noul", noul: 0.05 };
