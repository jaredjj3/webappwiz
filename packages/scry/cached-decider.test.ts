import { beforeEach, describe, expect, it } from "bun:test";
import { FakeFs } from "webappwiz/system/testing";
import { FakeWallClock } from "webappwiz/time/testing";
import { CachedDecider } from "./cached-decider";
import { Decisions } from "./decisions";
import { SourceFile } from "./source-file";
import { Span } from "./span";
import { FakeDecider } from "./testing";

describe("CachedDecider", () => {
	let fs: FakeFs;
	let inner: FakeDecider;
	const path = "/p/node_modules/.cache/scry/decisions.json";
	const file = new SourceFile("src/a.ts", "// add one\nn += 1;\n");
	const comment = new Span(file, 1, "// add one");

	const decider = async () =>
		new CachedDecider(
			inner,
			await Decisions.open(path, { fs }),
			"clef",
			new FakeWallClock(),
		);

	beforeEach(async () => {
		fs = new FakeFs();
		inner = new FakeDecider({ "add one": 0.9 });
	});

	it("asks once about the same question, line and file, and answers from what it kept after", async () => {
		const cached = await decider();

		const answers = [
			await cached.decide("Does it restate?", comment),
			await cached.decide("Does it restate?", comment),
		];

		expect(answers).toEqual([0.9, 0.9]);
		expect([inner.asked.length, cached.hits]).toEqual([1, 1]);
	});

	it("keeps what it was told between runs, once saved", async () => {
		const decisions = await Decisions.open(path, { fs });
		await new CachedDecider(inner, decisions, "clef").decide(
			"Does it restate?",
			comment,
		);
		await decisions.save();

		const again = await decider();
		await again.decide("Does it restate?", comment);

		expect([inner.asked.length, again.hits]).toEqual([1, 1]);
	});

	it("asks again once the file changed, or of another model", async () => {
		const decisions = await Decisions.open(path, { fs });
		await new CachedDecider(inner, decisions, "clef").decide(
			"Does it restate?",
			comment,
		);
		const edited = new SourceFile("src/a.ts", "// add one\nn += 2;\n");

		await new CachedDecider(inner, decisions, "clef").decide(
			"Does it restate?",
			new Span(edited, 1, "// add one"),
		);
		await new CachedDecider(inner, decisions, "jev-latest").decide(
			"Does it restate?",
			comment,
		);

		expect(inner.asked).toHaveLength(3);
	});

	it("says what was decided about a line of a file as it reads now", async () => {
		const decisions = await Decisions.open(path, { fs });
		await new CachedDecider(inner, decisions, "clef").decide(
			"Does it restate?",
			comment,
		);

		expect(decisions.about("src/a.ts", file.text, 1)).toMatchObject([
			{ question: "Does it restate?", probability: 0.9, model: "clef" },
		]);
		expect(decisions.about("src/a.ts", "changed\n", 1)).toEqual([]);
	});

	it("starts over from a store that will not parse", async () => {
		await fs.mkdir("/p/node_modules/.cache/scry");
		await fs.write(path, "{not json");

		await (await decider()).decide("Does it restate?", comment);

		expect(inner.asked).toHaveLength(1);
	});
});
