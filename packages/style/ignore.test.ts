// style-ignore-file no-em-dashes: the fixtures are source text about that rule
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
					"// style-ignore no-em-dashes: quoting a spec",
					'const b = "—";',
					'const c = "—";',
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
					"// style-ignore classes-over-function-exports: pure helper",
					"export function stamp(m: string, clock: Clock): string {",
					"\treturn clock.now() + m;",
					"}",
					"export function other(): void {}",
				].join("\n"),
			),
			"classes-over-function-exports",
		);

		expect(excused(2)).toBe(true);
		expect(excused(3)).toBe(true);
		expect(excused(5)).toBe(false);
	});

	it("excuses every line when the marker says file", () => {
		const excused = exemptions(
			lines("const a = 1;\n// style-ignore no-em-dashes: generated"),
			"no-em-dashes",
		);

		expect(excused(1)).toBe(false);

		const whole = exemptions(
			lines("const a = 1;\n// style-ignore-file no-em-dashes: generated"),
			"no-em-dashes",
		);

		expect(whole(1)).toBe(true);
		expect(whole(99)).toBe(true);
	});

	it("excuses nothing when the marker names another rule", () => {
		const excused = exemptions(
			lines("// style-ignore no-em-dashes: quoting a spec\nconst a = 1;"),
			"comments-say-why-not-what",
		);

		expect(excused(2)).toBe(false);
	});

	it("excuses nothing when the marker gives no reason", () => {
		const excused = exemptions(
			lines("// style-ignore no-em-dashes\nconst a = 1;"),
			"no-em-dashes",
		);

		expect(excused(2)).toBe(false);
	});

	it("reads a marker written in any comment syntax", () => {
		const hash = exemptions(
			lines("# style-ignore no-em-dashes: a shell script\ncode"),
			"no-em-dashes",
		);
		const html = exemptions(
			lines("<!-- style-ignore no-em-dashes: prose -->\ntext"),
			"no-em-dashes",
		);

		expect(hash(2)).toBe(true);
		expect(html(2)).toBe(true);
	});

	it("skips blank lines between the marker and what it covers", () => {
		const excused = exemptions(
			lines("// style-ignore no-em-dashes: reason\n\nconst a = 1;"),
			"no-em-dashes",
		);

		expect(excused(3)).toBe(true);
	});
});
