import { describe, expect, it } from "bun:test";
import { ExportLeadsTheFile } from "./export-leads-the-file";

// The document says what the rule is, to a human and to an agent. What is here
// is which declaration a finding points at, and the naming and scanner edges no
// document should have to teach.
describe("export-leads-the-file", () => {
	it("points at every declaration above the namesake", () => {
		const text = [
			"function pad() {}",
			"class Inner {}",
			"export class Stamper {}",
		].join("\n");

		expect(
			new ExportLeadsTheFile().check({ path: "stamper.ts", text }).findings,
		).toEqual([
			{ line: 1, column: 1, message: expect.stringContaining("move it below") },
			{ line: 2, column: 1, message: expect.stringContaining("move it below") },
		]);
	});

	it("passes a file whose helpers sit below the namesake", () => {
		const text = ["export class Stamper {}", "function pad() {}"].join("\n");

		expect(
			new ExportLeadsTheFile().check({ path: "stamper.ts", text }).findings,
		).toEqual([]);
	});

	it("matches a kebab case file name against its pascal case export", () => {
		const text = ["function pad() {}", "export class OneClassPerFile {}"].join(
			"\n",
		);

		expect(
			new ExportLeadsTheFile().check({
				path: "src/one-class-per-file.ts",
				text,
			}).findings,
		).toEqual([
			{ line: 1, column: 1, message: expect.stringContaining("move it below") },
		]);
	});

	it("reports nothing when no declaration carries the file's name", () => {
		const text = ["function pad() {}", "export class Stamper {}"].join("\n");

		expect(
			new ExportLeadsTheFile().check({ path: "index.ts", text }).findings,
		).toEqual([]);
	});

	it("leaves types and constants above the namesake alone", () => {
		const text = [
			'export type Level = "error";',
			"const RETRIES = 3;",
			"export class Stamper {}",
		].join("\n");

		expect(
			new ExportLeadsTheFile().check({ path: "stamper.ts", text }).findings,
		).toEqual([]);
	});

	it("ignores a class expression assigned above the namesake", () => {
		const text = [
			"const Anonymous = class {};",
			"const make = function () {};",
			"export class Stamper {}",
		].join("\n");

		expect(
			new ExportLeadsTheFile().check({ path: "stamper.ts", text }).findings,
		).toEqual([]);
	});

	it("ignores declarations nested inside the namesake", () => {
		const text = [
			"export class Stamper {",
			"\tstamp() {",
			"\t\tfunction pad() {}",
			"\t}",
			"}",
		].join("\n");

		expect(
			new ExportLeadsTheFile().check({ path: "stamper.ts", text }).findings,
		).toEqual([]);
	});

	it("leaves an exported class above the namesake to the agent", () => {
		const text = [
			"export class MarkdownError extends Error {}",
			"export class Markdown {}",
		].join("\n");

		expect(
			new ExportLeadsTheFile().check({ path: "markdown.ts", text }).findings,
		).toEqual([]);
	});

	it("names a generator above the namesake", () => {
		const text = ["function* walk() {}", "export class Stamper {}"].join("\n");

		expect(
			new ExportLeadsTheFile().check({ path: "stamper.ts", text }).findings,
		).toEqual([
			{ line: 1, column: 1, message: expect.stringContaining("move it below") },
		]);
	});
});
