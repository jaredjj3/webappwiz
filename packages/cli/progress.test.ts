import { describe, expect, it } from "bun:test";
import { color } from "webappwiz/log";
import { Duration } from "webappwiz/time";
import { render, type WorkerView } from "./progress";

describe("render", () => {
	const busy = (over: Partial<WorkerView> = {}): WorkerView => ({
		worker: 0,
		review: {
			label: "classes, docs",
			files: 17,
			reading: 14_000,
			elapsed: Duration.secs(12),
		},
		done: 2,
		tokens: 31_000,
		...over,
	});
	const plain = (lines: string[]) => lines.map((line) => color.strip(line));

	it("shows the review in flight, its size, and both clocks", () => {
		expect(plain(render([busy()], 100))).toEqual([
			"w1  classes, docs (17 files, ~14K tokens)  12.0s  2 calls, 31K tokens",
		]);
	});

	it("says a worker ran dry rather than dropping its line", () => {
		expect(
			plain(
				render([busy({ review: undefined, done: 3, tokens: 45_000 })], 100),
			),
		).toEqual(["w1  idle  3 calls, 45K tokens"]);
	});

	it("leaves the totals off a worker on its first call", () => {
		expect(plain(render([busy({ done: 0, tokens: undefined })], 100))).toEqual([
			"w1  classes, docs (17 files, ~14K tokens)  12.0s",
		]);
	});

	it("leaves tokens off for an agent that reports none", () => {
		expect(plain(render([busy({ tokens: undefined })], 100))[0]).toEndWith(
			"12.0s  2 calls",
		);
	});

	it("truncates the label rather than the numbers", () => {
		const long = busy({
			review: {
				label: "a".repeat(120),
				files: 17,
				reading: 14_000,
				elapsed: Duration.secs(12),
			},
		});

		const [line = ""] = plain(render([long], 80));

		expect(line.length).toBeLessThanOrEqual(80);
		expect(line).toContain("…");
		expect(line).toEndWith("12.0s  2 calls, 31K tokens");
	});

	it("numbers workers from one, in slot order", () => {
		const lines = plain(
			render([busy(), busy({ worker: 2, review: undefined })], 100),
		);

		expect(lines[0]).toStartWith("w1  ");
		expect(lines[1]).toStartWith("w3  ");
	});
});
