import { beforeEach, describe, expect, it } from "bun:test";
import { Progress } from "@webappwiz/scry";
import { color } from "webappwiz/log";
import { FakeTimer } from "webappwiz/time/testing";
import { type Asking, Spinner } from "./spinner";

describe("Spinner", () => {
	let timer: FakeTimer;
	let progress: Progress;
	let decider: { spent: Asking["spent"]; answered: number };
	let written: string[];

	const screen = (live: boolean, columns = 200) => ({
		live,
		columns,
		write: (text: string) => {
			written.push(text);
		},
	});
	const spinner = (live = true, columns?: number) =>
		new Spinner({
			screen: screen(live, columns),
			timer,
			progress,
			decider,
			verb: "checking",
			noun: "file",
		});

	beforeEach(() => {
		timer = new FakeTimer();
		progress = new Progress();
		decider = {
			spent: { requests: 0, questions: 0, input: 0, cached: 0 },
			answered: 0,
		};
		written = [];
	});

	it("says how many files are done, and what the decider asked, answered and had cached", () => {
		const shown = spinner();
		progress.total = 100;
		progress.done = 42;

		expect(shown.text()).toBe("checking 42 of 100 files");
		decider.spent = { requests: 3, questions: 120, input: 0, cached: 300 };
		decider.answered = 80;
		expect(shown.text()).toBe(
			"checking 42 of 100 files · 120 questions asked, 80 answered, 300 from cache",
		);
		decider.spent = { requests: 0, questions: 0, input: 0, cached: 1 };
		progress.total = 1;
		expect(shown.text()).toBe("checking 42 of 1 file · 1 from cache");
	});

	it("draws the counts on one line from its first tick, and redraws them on each", () => {
		const shown = spinner();
		progress.total = 2;

		shown.start();
		expect(written).toEqual([]);
		timer.fireIntervals();
		progress.done = 1;
		timer.fireIntervals();

		expect(written.map(color.strip)).toEqual([
			"\r⠋ checking 0 of 2 files\u001B[K",
			"\r⠙ checking 1 of 2 files\u001B[K",
		]);
		expect(timer.intervals.map((entry) => entry.delay.ms)).toEqual([100]);
	});

	it("erases its line and stops ticking once disposed", () => {
		const shown = spinner();
		shown.start();
		timer.fireIntervals();

		shown.dispose();
		shown.dispose();
		timer.fireIntervals();

		expect(written.slice(1)).toEqual(["\r\u001B[K"]);
		expect(timer.intervals.every((entry) => entry.disposed)).toBe(true);
	});

	it("draws nothing, and never ticks, where the screen is not live", () => {
		const shown = spinner(false);

		shown.start();
		shown.dispose();

		expect([written, timer.intervals]).toEqual([[], []]);
	});

	it("cuts the line short of the screen's width, so it never wraps", () => {
		progress.total = 100;
		spinner(true, 13).start();
		timer.fireIntervals();

		expect(written.map(color.strip)).toEqual(["\r⠋ checking 0\u001B[K"]);
	});
});
