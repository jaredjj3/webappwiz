import { describe, expect, it } from "bun:test";
import { color } from "webappwiz/log";
import { FakeTimer } from "webappwiz/time/testing";
import { Progress, type RunView, render } from "./progress";

describe("progress", () => {
	const view = (over: Partial<RunView> = {}): RunView => ({
		done: 5,
		total: 12,
		files: 58,
		tokens: 82_000,
		problems: 0,
		...over,
	});
	const plain = (line: string) => color.strip(line);

	it("shows a bar over the calls, what is out, spent, and found", () => {
		expect(plain(render(view()))).toBe(
			`⠋ ${"█".repeat(8)}${"░".repeat(12)}  5/12 calls · judging 58 files` +
				" · 82K tokens · clean so far",
		);
	});

	it("counts the problems once calls find them", () => {
		expect(plain(render(view({ problems: 3 })))).toEndWith("3 problems");
	});

	it("claims nothing before the first call is home", () => {
		expect(plain(render(view({ done: 0 })))).not.toContain("clean");
	});

	it("starts empty and fills the bar as calls finish", () => {
		expect(plain(render(view({ done: 0, tokens: undefined })))).toStartWith(
			`⠋ ${"░".repeat(20)}`,
		);
		expect(
			plain(render(view({ done: 12, files: 0, tokens: undefined }))),
		).toStartWith(`  ${"█".repeat(20)}`);
	});

	it("walks the spinner with the frame, wrapping at the end", () => {
		expect(plain(render(view(), 1))).toStartWith("⠙ ");
		expect(plain(render(view(), 10))).toStartWith("⠋ ");
	});

	it("spins nothing while nothing runs", () => {
		expect(plain(render(view({ files: 0 }), 3))).toStartWith("  ");
	});

	it("leaves tokens off until an agent reports usage", () => {
		expect(plain(render(view({ tokens: undefined })))).toEndWith(
			"5/12 calls · judging 58 files · clean so far",
		);
	});

	it("spins on the tick, and the tick dies with the line", () => {
		const writes: string[] = [];
		const timer = new FakeTimer();
		const progress = new Progress(
			{ tty: true, write: (text) => writes.push(text) },
			4,
			{ timer },
		);

		progress.started(4);
		timer.fireIntervals();

		const drawn = color.strip(writes.join(""));
		expect(drawn).toContain("⠋"); // the first draw
		expect(drawn).toContain("⠙"); // and the tick's

		progress.stop();
		const settled = writes.length;
		timer.fireIntervals();

		expect(writes.length).toBe(settled); // stopped means stopped
	});
});
