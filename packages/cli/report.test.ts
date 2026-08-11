import { describe, expect, it } from "bun:test";
import { color } from "@webappwiz/log";
import type { Violation } from "@webappwiz/style";
import { Duration } from "@webappwiz/time";
import { finding, finished, summary } from "./report";

describe("report", () => {
	const violation = (over: Partial<Violation> = {}): Violation => ({
		id: "comments-say-why-not-what",
		level: "error",
		file: "src/a.ts",
		line: 3,
		message: "the comment restates the increment below it",
		code: "// increment the counter",
		...over,
	});
	const plain = (lines: string[]) => lines.map((line) => color.strip(line));

	it("puts a clickable location, the level and the violation on one line", () => {
		expect(plain(finding(violation()))[0]).toBe(
			"  src/a.ts:3  error  the comment restates the increment below it",
		);
	});

	it("leaves the rule off a finding, since its heading carries it", () => {
		expect(plain(finding(violation()))[0]).not.toContain("comments-say-why");
	});

	it("spaces the violation off the level the way the level is spaced off the location", () => {
		const [line] = plain(finding(violation()));

		expect(line).toContain("src/a.ts:3  error  the comment");
	});

	it("quotes the offending line under the finding", () => {
		expect(plain(finding(violation()))[1]).toBe("  │ // increment the counter");
	});

	it("leaves the quote out when the line could not be read", () => {
		expect(finding(violation({ code: "" }))).toHaveLength(1);
	});

	it("colors an error red and a warning yellow", () => {
		expect(finding(violation())[0]).toContain(color.red("error"));
		expect(finding(violation({ level: "warning" }))[0]).toContain(
			color.yellow("warning"),
		);
	});

	it("names the rule, its id and what it cost when a task finds nothing", () => {
		const lines = finished({
			rule: "Doc comments address users",
			id: "doc-comments-address-users",
			violations: [],
			took: Duration.secs(8.25),
			done: 2,
			total: 6,
		});

		expect(plain(lines)).toEqual([
			"✓ [2/6] Doc comments address users (doc-comments-address-users): clean in 8.3s",
		]);
	});

	it("heads a task's findings with how many it found", () => {
		const lines = finished({
			rule: "Comments say why, not what",
			id: "comments-say-why-not-what",
			violations: [violation(), violation({ line: 9 })],
			took: Duration.secs(41),
			done: 3,
			total: 6,
		});

		expect(plain(lines)[0]).toBe(
			"✗ [3/6] Comments say why, not what (comments-say-why-not-what): 2 problems in 41.0s",
		);
		expect(plain(lines)).toHaveLength(5); // heading, then two findings and their quotes
	});

	it("says so plainly when the whole run is clean", () => {
		expect(color.strip(summary([], Duration.secs(3)))).toBe(
			"✓ no style violations in 3.0s",
		);
	});

	it("counts errors and warnings separately when tallying", () => {
		const tally = summary(
			[violation(), violation({ level: "warning" })],
			Duration.mins(1.5),
		);

		expect(color.strip(tally)).toBe(
			"✖ 2 problems (1 error, 1 warning) in 1m 30s",
		);
	});
});
