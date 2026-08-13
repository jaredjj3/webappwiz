import { describe, expect, it } from "bun:test";
import { NamedOptionsLast } from "./named-options-last";

// The document says what the rule is, to a human and to an agent. What is
// here is where a finding points, and telling a parameter list from a call's arguments,
// which no document should have to teach.
describe("named-options-last", () => {
	it("points at an options parameter typed in place or left mid-list", () => {
		const text = [
			"export function retry(options: Options, task: Task): void {",
			"\trun((options: { now: boolean }, next: Next) => task(next));",
			"}",
		].join("\n");

		expect(new NamedOptionsLast().check(text)).toEqual([
			{ line: 1, column: 23, message: expect.stringContaining("goes last") },
			{ line: 2, column: 7, message: expect.stringContaining("in place") },
			{ line: 2, column: 7, message: expect.stringContaining("goes last") },
		]);
	});

	it("takes a call's arguments for arguments, not parameters", () => {
		const text = [
			"write(options, path);",
			"send({ options: true });",
			"pick(ready ? options : fallback, path);",
		].join("\n");

		expect(new NamedOptionsLast().check(text)).toEqual([]);
	});

	it("leaves an object type in place on a parameter that is not options", () => {
		const text = "rows.map((row: { task: string }) => row.task);";

		expect(new NamedOptionsLast().check(text)).toEqual([]);
	});

	it("allows options last, past a rest parameter or a type argument", () => {
		const text = [
			"function keep(options: Options, ...rest: string[]): void {}",
			"function label(options: Record<string, string>): void {}",
		].join("\n");

		expect(new NamedOptionsLast().check(text)).toEqual([]);
	});
});
