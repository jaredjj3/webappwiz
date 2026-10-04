import { describe, expect, it } from "bun:test";
import { Cases, SourceFile } from "@webappwiz/scry";
import ExportLeadsTheFile from "./rule";

const cases = await Cases.load(import.meta.dir);

describe("export-leads-the-file", () => {
	const rule = new ExportLeadsTheFile();

	it.each(cases.bad)("flags $name", async ({ file }) => {
		expect(await rule.check(file)).not.toEqual([]);
	});

	it.each(cases.good)("passes $name", async ({ file }) => {
		expect(await rule.check(file)).toEqual([]);
	});

	it("flags the export a file is named for when it starts below the first screen", async () => {
		const file = new SourceFile(
			"stamper.ts",
			`${"export type A = 1;\n".repeat(50)}export class Stamper {}\n`,
		);

		expect(await rule.check(file)).toEqual([
			{
				line: 51,
				message: "Bring Stamper onto the first screen: it starts on line 51.",
				confidence: 1,
			},
		]);
	});

	it("counts the export from its doc comment, where a reader meets it", async () => {
		const file = new SourceFile(
			"stamper.ts",
			`${"export type A = 1;\n".repeat(48)}/**\n * Stamps.\n */\nexport class Stamper {}\n`,
		);

		expect(await rule.check(file)).toEqual([]);
	});

	it("flags each helper above the export at its line", async () => {
		const file = new SourceFile(
			"stamper.ts",
			"function pad() {}\nconst trim = () => 1;\nconst SIZE = 3;\nexport class Stamper {}\n",
		);

		expect((await rule.check(file)).map((finding) => finding.message)).toEqual([
			"Move pad below Stamper, or make it a private method of it.",
			"Move trim below Stamper, or make it a private method of it.",
		]);
	});
});
