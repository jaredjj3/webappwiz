import { describe, expect, it } from "bun:test";
import { exemptions } from "./ignore";

const lines = (text: string): string[] => text.split("\n");

describe("ignore", () => {
	it("excuses nothing when the file has no marker", () => {
		const excused = exemptions(
			lines("const a = 1;\nconst b = 2;"),
			"no-em-dashes",
		);

		expect(excused(1)).toBe(false);
		expect(excused(2)).toBe(false);
	});

	it("excuses the marker and the statement under it", () => {
		const excused = exemptions(
			lines(
				[
					"const a = 1;",
					"// lint-ignore no-em-dashes: quoting a spec",
					'const b = "\u2014";',
					'const c = "\u2014";',
				].join("\n"),
			),
			"no-em-dashes",
		);

		expect(excused(1)).toBe(false);
		expect(excused(2)).toBe(true);
		expect(excused(3)).toBe(true);
		expect(excused(4)).toBe(false);
	});

	it("excuses a whole declaration when the marker sits above one", () => {
		const excused = exemptions(
			lines(
				[
					"// lint-ignore one-class-per-file: local fake for this suite",
					"class FakeClock {",
					"\tnow(): Date { return new Date(0); }",
					"}",
					"class RealDeal {}",
				].join("\n"),
			),
			"one-class-per-file",
		);

		expect(excused(2)).toBe(true);
		expect(excused(3)).toBe(true);
		expect(excused(5)).toBe(false);
	});

	it("excuses every line when the marker says file", () => {
		const excused = exemptions(
			lines("const a = 1;\n// lint-ignore-file no-em-dashes: generated"),
			"no-em-dashes",
		);

		expect(excused(1)).toBe(true);
	});

	it("does not let one rule's marker excuse another rule", () => {
		const excused = exemptions(
			lines("// lint-ignore-file no-em-dashes: generated\nclass A {}"),
			"one-class-per-file",
		);

		expect(excused(2)).toBe(false);
	});

	it("excuses nothing for a marker without a reason", () => {
		const excused = exemptions(
			lines("// lint-ignore-file no-em-dashes:\nconst a = 1;"),
			"no-em-dashes",
		);

		expect(excused(2)).toBe(false);
	});
});
