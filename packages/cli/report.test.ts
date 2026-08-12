import { describe, expect, it } from "bun:test";
import type { Violation } from "@webappwiz/lint";
import { color } from "@webappwiz/log";
import { Duration } from "@webappwiz/time";
import {
	estimate,
	finding,
	finished,
	overBudget,
	planned,
	summary,
	tokens,
	usd,
} from "./report";

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

	it("names the glob, its rule count and what it cost when a task finds nothing", () => {
		const lines = finished({
			glob: "**/*.ts",
			rules: ["doc-comments-address-users"],
			violations: [],
			took: Duration.secs(8.25),
			done: 2,
			total: 6,
		});

		expect(plain(lines)).toEqual(["✓ [2/6] **/*.ts (1 rule): clean in 8.3s"]);
	});

	it("heads a task's findings with how many it found", () => {
		const lines = finished({
			glob: "**/*.ts",
			rules: ["comments-say-why-not-what", "doc-comments-address-users"],
			violations: [violation(), violation({ line: 9 })],
			took: Duration.secs(41),
			done: 3,
			total: 6,
		});

		expect(plain(lines)[0]).toBe(
			"✗ [3/6] **/*.ts (2 rules): 2 problems in 41.0s",
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

	it("counts the agent calls a run is about to make, not its tasks", () => {
		expect(
			color.strip(planned(203, 7, 52, 589_000, "claude -p --model haiku")),
		).toBe(
			"checking 203 files against 7 rules in 52 agent calls, " +
				"reading 589K+ tokens, using: claude -p --model haiku",
		);
	});

	it("gives each count its own color, and the command another", () => {
		const line = planned(203, 7, 52, 589_000, "claude -p --model haiku");

		expect(line).toContain(color.blue("203 files"));
		expect(line).toContain(color.green("7 rules"));
		expect(line).toContain(color.yellow("52 agent calls"));
		expect(line).toContain(color.red("589K+ tokens"));
		expect(line).toContain(color.bold("claude -p --model haiku"));
	});

	it("names no command when there is no agent to name", () => {
		expect(color.strip(planned(203, 7, 52, 589_000))).toBe(
			"checking 203 files against 7 rules in 52 agent calls, reading 589K+ tokens",
		);
	});

	it("counts four bytes to the token, rounding a partial token up", () => {
		expect(tokens(4000)).toBe(1000);
		expect(tokens(1)).toBe(1);
		expect(tokens(0)).toBe(0);
	});

	it("says both numbers and the flag when a run is over budget", () => {
		expect(color.strip(overBudget(589_000, 200_000))).toBe(
			"! this run reads at least 589K tokens, over the 200K budget, " +
				"and the real cost will be higher. Raise it with --budget.",
		);
	});

	it("quotes the money too when the agent over budget has a price", () => {
		expect(color.strip(overBudget(589_000, 200_000, 1.767))).toBe(
			"! this run reads at least 589K tokens, over the 200K budget, " +
				"and the real cost will be higher. That is $1.767 or more. " +
				"Raise it with --budget.",
		);
	});

	it("spends two decimals on a run's total and four on a single call", () => {
		expect(usd(12.3)).toBe("$12.30");
		expect(usd(0.056097)).toBe("$0.0561");
	});

	it("says what a task cost beside how long it took", () => {
		const lines = finished({
			glob: "**/*.ts",
			rules: ["doc-comments-address-users"],
			violations: [],
			took: Duration.secs(8.25),
			cost: 0.0912,
			done: 2,
			total: 6,
		});

		expect(plain(lines)).toEqual([
			"✓ [2/6] **/*.ts (1 rule): clean in 8.3s  $0.0912",
		]);
	});

	it("totals what a run cost under the tally", () => {
		expect(color.strip(summary([], Duration.secs(3), 1.62))).toBe(
			"✓ no violations in 3.0s  $1.62 total",
		);
	});

	it("prices a plan against every agent, floor first", () => {
		const lines = plain(estimate(203, 7, 52, 480_000, {}));

		expect(lines[0]).toBe(
			"checking 203 files against 7 rules in 52 agent calls, reading 480K+ tokens",
		);
		expect(lines[2]).toBe("  AGENT   FLOOR");
		expect(lines[3]).toBe("  haiku   $0.48+");
		expect(lines[4]).toBe("  sonnet  $1.44+");
		expect(lines[5]).toBe("  opus    $2.40+");
	});

	it("says a run is what turns the floor into a measurement", () => {
		expect(plain(estimate(203, 7, 52, 480_000, {})).join("\n")).toContain(
			"Run one of these and the estimate is measured against it next time.",
		);
	});

	it("adds the measured per-call overhead to the floor, once per call", () => {
		const lines = plain(estimate(203, 7, 52, 480_000, { haiku: 0.065 }));

		expect(lines[2]).toBe("  AGENT   FLOOR   MEASURED");
		// $0.48 of files, and 52 calls charging $0.065 each on top of them
		expect(lines[3]).toBe("  haiku   $0.48+  $3.86");
	});

	it("leaves the measurement blank for an agent no run has priced", () => {
		const lines = plain(estimate(203, 7, 52, 480_000, { haiku: 0.065 }));

		expect(lines[4]).toBe("  sonnet  $1.44+");
		expect(lines[5]).toBe("  opus    $2.40+");
	});
});
