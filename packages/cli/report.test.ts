import { describe, expect, it } from "bun:test";
import type { Violation } from "@webappwiz/rules";
import { color } from "webappwiz/log";
import { Duration } from "webappwiz/time";
import { divider, finding, finished, planned, summary, tokens } from "./report";

describe("report", () => {
	const plan = {
		files: 203,
		rules: 7,
		calls: 52,
		estimate: 589_000,
		concurrency: 4,
		agent: "claude -p --model haiku",
	};
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

	it("puts a clickable location, the level, the violation and its rule on one line", () => {
		expect(plain(finding(violation()))[0]).toBe(
			"  src/a.ts:3  error  the comment restates the increment below it " +
				"(comments-say-why-not-what)",
		);
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

	it("sizes a call when a review finds nothing", () => {
		const lines = finished({
			rules: ["doc-comments-address-users"],
			files: 25,
			violations: [],
			took: Duration.secs(8.25),
			done: 2,
			total: 6,
		});

		expect(plain(lines)).toEqual(["✓ [2/6] (1 rule, 25 files): clean in 8.3s"]);
	});

	it("leaves the rule ids out of a heading, since a finding names its own", () => {
		const lines = finished({
			rules: ["comments-say-why-not-what", "doc-comments-address-users"],
			files: 4,
			violations: [],
			took: Duration.secs(8.25),
			done: 2,
			total: 6,
		});

		expect(plain(lines)[0]).not.toContain("comments-say-why-not-what");
	});

	it("heads a review's findings with how many it found", () => {
		const lines = finished({
			rules: ["comments-say-why-not-what", "doc-comments-address-users"],
			files: 4,
			violations: [violation(), violation({ line: 9 })],
			took: Duration.secs(41),
			done: 3,
			total: 6,
		});

		expect(plain(lines)[0]).toBe(
			"✗ [3/6] (2 rules, 4 files): 2 problems in 41.0s",
		);
		expect(plain(lines)).toHaveLength(5); // heading, then two findings and their quotes
	});

	it("says so plainly when the whole run is clean", () => {
		expect(color.strip(summary([], Duration.secs(3)))).toBe(
			"✓ no violations in 3.0s",
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

	it("tables what a run is about to do, counting agent calls rather than reviews", () => {
		expect(plain(planned(plan))).toEqual([
			"",
			"  files     203",
			"  rules     7",
			"  calls     52, 4 at a time",
			"  reading   589K+ tokens",
			"  agent     claude -p --model haiku",
			"",
		]);
	});

	it("leaves out the concurrency when it has none", () => {
		expect(plain(planned({ ...plan, concurrency: undefined }))).toEqual([
			"",
			"  files     203",
			"  rules     7",
			"  calls     52",
			"  reading   589K+ tokens",
			"  agent     claude -p --model haiku",
			"",
		]);
	});

	it("names no command when there is no agent to name", () => {
		const bare = { ...plan, agent: undefined, concurrency: undefined };

		expect(plain(planned(bare))).toEqual([
			"",
			"  files     203",
			"  rules     7",
			"  calls     52",
			"  reading   589K+ tokens",
			"",
		]);
	});

	it("counts four bytes to the token, rounding a partial token up", () => {
		expect(tokens(4000)).toBe(1000);
		expect(tokens(1)).toBe(1);
		expect(tokens(0)).toBe(0);
	});

	it("names the document a divider opens, and rules off to one width", () => {
		expect(color.strip(divider("one, two (3 files)"))).toBe(
			`--- one, two (3 files) ${"-".repeat(49)}`,
		);
		expect(color.strip(divider())).toBe("-".repeat(72));
	});

	it("rules off past the width rather than stopping at a long name", () => {
		const name = "a".repeat(80);

		expect(color.strip(divider(name))).toBe(`--- ${name} ---`);
	});
});
