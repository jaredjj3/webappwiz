import { describe, expect, it } from "bun:test";
import { color } from "webappwiz/log";
import { type RunView, render } from "./progress";

describe("render", () => {
	const view = (over: Partial<RunView> = {}): RunView => ({
		done: 5,
		total: 12,
		running: 4,
		tokens: 82_000,
		...over,
	});
	const plain = (line: string) => color.strip(line);

	it("shows a bar over the calls, what is out, and what is spent", () => {
		expect(plain(render(view()))).toBe(
			`${"█".repeat(8)}${"░".repeat(12)}  5/12 calls · 4 running · 82K tokens`,
		);
	});

	it("starts empty and fills the bar as calls finish", () => {
		expect(plain(render(view({ done: 0, tokens: undefined })))).toStartWith(
			"░".repeat(20),
		);
		expect(
			plain(render(view({ done: 12, running: 0, tokens: undefined }))),
		).toStartWith("█".repeat(20));
	});

	it("leaves tokens off until an agent reports usage", () => {
		expect(plain(render(view({ tokens: undefined })))).toEndWith(
			"5/12 calls · 4 running",
		);
	});
});
