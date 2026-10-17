import { describe, expect, it } from "bun:test";
import { color } from "webappwiz/log";
import { table, wrap } from "./help";

const plain = (label: string) => label;

describe("help", () => {
	it("wraps at the last space that fits", () => {
		expect(wrap("one two three four", 9)).toEqual(["one two", "three", "four"]);
	});

	it("wraps a word wider than the width onto a line of its own", () => {
		expect(wrap("a enormous b", 4)).toEqual(["a", "enormous", "b"]);
	});

	it("wraps by what shows, not colour codes", () => {
		const lines = wrap(`one ${color.dim("two")} three`, 7);
		expect(lines.map((line) => color.strip(line))).toEqual([
			"one two",
			"three",
		]);
	});

	it("keeps the text's own line breaks when wrapping", () => {
		expect(wrap("one two\nthree", 20)).toEqual(["one two", "three"]);
	});

	it("wraps nothing without a width", () => {
		expect(wrap("one two three", undefined)).toEqual(["one two three"]);
	});

	it("pads labels into a column, one line a row without a width", () => {
		expect(
			table(
				[
					["a", "does a"],
					["bb", ""],
				],
				plain,
				undefined,
			),
		).toEqual(["  a   does a", "  bb"]);
	});

	it("wraps a row back to its own column and parts the rows", () => {
		const text = "a long enough description to wrap at forty";
		expect(
			table(
				[
					["a", text],
					["b", "short"],
				],
				plain,
				40,
			),
		).toEqual([
			"  a  a long enough description to wrap",
			"     at forty",
			"",
			"  b  short",
		]);
	});

	it("leaves rows unparted when none wraps", () => {
		expect(
			table(
				[
					["a", "x"],
					["b", "y"],
				],
				plain,
				40,
			),
		).toEqual(["  a  x", "  b  y"]);
	});

	it("puts text under its label when the column beside it is too narrow", () => {
		expect(table([["a-very-long-label", "does a thing"]], plain, 40)).toEqual([
			"  a-very-long-label",
			"      does a thing",
		]);
	});
});
