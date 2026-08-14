import { describe, expect, it } from "bun:test";

import { AssertError, assert, ensure } from "./index";

describe("assert", () => {
	it("throws an AssertError carrying the message", () => {
		expect(() => assert.that(false, "nope")).toThrow(AssertError);
		expect(() => assert.that(false, "nope")).toThrow("nope");
	});

	it("rejects NaN as a number, since arithmetic already produced it", () => {
		expect(() => assert.number(Number.NaN)).toThrow(AssertError);
		expect(() => assert.number(1.5)).not.toThrow();
		expect(() => assert.integer(1.5)).toThrow(AssertError);
	});

	it("holds a value between inclusive bounds", () => {
		expect(() => assert.inRange(1, 1, 3)).not.toThrow();
		expect(() => assert.inRange(3, 1, 3)).not.toThrow();
		expect(() => assert.inRange(4, 1, 3)).toThrow(AssertError);
	});

	it("tells null and undefined apart", () => {
		expect(() => assert.notNull(undefined)).not.toThrow();
		expect(() => assert.notNull(null)).toThrow(AssertError);
		expect(() => assert.defined(null)).not.toThrow();
		expect(() => assert.defined(undefined)).toThrow(AssertError);
		expect(() => assert.present(null)).toThrow(AssertError);
	});

	it("narrows what it checked", () => {
		const value = "hi" as string | null;
		assert.present(value);
		expect(value.length).toBe(2);
	});
});

describe("ensure", () => {
	it("returns the value it checked", () => {
		expect(ensure.integer(7)).toBe(7);
		expect(ensure.present("hi")).toBe("hi");
		expect(ensure.inRange(2, 1, 3)).toBe(2);
	});

	it("throws on the same conditions assert does", () => {
		expect(() => ensure.present(null)).toThrow(AssertError);
	});
});
