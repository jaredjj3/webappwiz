import { describe, expect, it } from "bun:test";
import { shallowEqual } from "./shallow-equal";

describe("shallowEqual", () => {
	it("holds for the same reference", () => {
		const value = { a: 1 };
		expect(shallowEqual(value, value)).toBe(true);
	});

	it("holds for two objects with the same keys and values", () => {
		expect(shallowEqual({ a: 1, b: "two" }, { a: 1, b: "two" })).toBe(true);
	});

	it("fails when a value differs", () => {
		expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
	});

	it("fails when nested objects are only deeply equal", () => {
		expect(shallowEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(false);
	});

	it("fails when one side has an extra key", () => {
		expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
	});

	it("fails when the keys differ but both are undefined", () => {
		// Same key count, and a missing key reads as undefined, so comparing
		// values alone would wrongly call these equal.
		expect(shallowEqual({ a: undefined }, { b: undefined })).toBe(false);
	});

	it("holds for two NaNs", () => {
		expect(shallowEqual({ a: Number.NaN }, { a: Number.NaN })).toBe(true);
	});

	it("fails for null against an object", () => {
		expect(shallowEqual<unknown>(null, {})).toBe(false);
	});

	it("holds for two equal primitives", () => {
		expect(shallowEqual(1, 1)).toBe(true);
	});
});
