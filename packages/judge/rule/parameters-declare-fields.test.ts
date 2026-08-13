import { describe, expect, it } from "bun:test";
import { ParametersDeclareFields } from "./parameters-declare-fields";

// The document says what the rule is, to a human and to an agent. What is
// here is where a finding points, and the token edges no document should have to teach.
describe("parameters-declare-fields", () => {
	it("points at the assignment copying a parameter into its field", () => {
		const text = [
			"class Stamper {",
			"\tprivate readonly clock: Clock;",
			"",
			"\tconstructor(clock: Clock) {",
			"\t\tthis.clock = clock;",
			"\t}",
			"}",
		].join("\n");

		expect(new ParametersDeclareFields().check(text)).toEqual([
			{
				line: 5,
				column: 3,
				message: expect.stringContaining("put the modifier on the parameter"),
			},
		]);
	});

	it("leaves a parameter that already declares its field alone", () => {
		const text = [
			"class Stamper {",
			"\tconstructor(private clock: Clock) {",
			"\t\tthis.clock = clock;",
			"\t}",
			"}",
		].join("\n");

		expect(new ParametersDeclareFields().check(text)).toEqual([]);
	});

	it("does not read a type argument as a parameter name", () => {
		const text = [
			"class Registry {",
			"\tprivate readonly entries: Map<string, Entry>;",
			"",
			"\tconstructor(seed: Map<string, Entry>) {",
			"\t\tthis.entries = new Map(seed);",
			"\t\tthis.Entry = Entry;",
			"\t}",
			"}",
		].join("\n");

		expect(new ParametersDeclareFields().check(text)).toEqual([]);
	});

	it("leaves an assignment the constructor decides to the body", () => {
		const text = [
			"class Retry {",
			"\tprivate readonly attempts: number;",
			"",
			"\tconstructor(attempts?: number) {",
			"\t\tif (attempts !== undefined) {",
			"\t\t\tthis.attempts = attempts;",
			"\t\t} else {",
			"\t\t\tthis.attempts = 3;",
			"\t\t}",
			"\t}",
			"}",
		].join("\n");

		expect(new ParametersDeclareFields().check(text)).toEqual([]);
	});

	it("does not mistake a method's own copy for a constructor's", () => {
		const text = [
			"class Saver {",
			"\tconstructor(private files: FileSystem) {}",
			"",
			"\tsave(path: string) {",
			"\t\tthis.path = path;",
			"\t}",
			"}",
		].join("\n");

		expect(new ParametersDeclareFields().check(text)).toEqual([]);
	});

	it("catches every copy a wide constructor makes", () => {
		const text = [
			"class Saver {",
			"\tprivate readonly files: FileSystem;",
			"\tprivate readonly path: string;",
			"",
			"\tconstructor(files: FileSystem, path = '/tmp') {",
			"\t\tthis.files = files;",
			"\t\tthis.path = path;",
			"\t}",
			"}",
		].join("\n");

		expect(new ParametersDeclareFields().check(text)).toHaveLength(2);
	});
});
