import { describe, expect, it } from "bun:test";

import { t } from "./t";

describe("t", () => {
	it("returns the raw arg when parsing a string", () => {
		expect(t.string().parse("ada")).toBe("ada");
		expect(t.string().parse("")).toBe("");
	});

	it("converts decimal, negative, and hex forms when parsing a number", () => {
		expect(t.number().parse("42")).toBe(42);
		expect(t.number().parse("-1.5")).toBe(-1.5);
		expect(t.number().parse("0x10")).toBe(16);
	});

	it("throws a readable message when a number arg is not numeric", () => {
		expect(() => t.number().parse("abc")).toThrow(
			'expected a number, got "abc"',
		);
	});

	it("treats a bare boolean flag as true and --loud=false as false", () => {
		expect(t.boolean().parse("")).toBe(true);
		expect(t.boolean().parse("true")).toBe(true);
		expect(t.boolean().parse("false")).toBe(false);
	});

	it("returns an independent schema instance on every call", () => {
		expect(t.string()).not.toBe(t.string());
	});

	it("returns the value when check gets the right type", () => {
		expect(t.string().check("ada")).toBe("ada");
		expect(t.number().check(42)).toBe(42);
		expect(t.boolean().check(false)).toBe(false);
	});

	it("throws when check gets the wrong type", () => {
		expect(() => t.string().check(42)).toThrow("expected string");
		expect(() => t.number().check("42")).toThrow("expected number");
		expect(() => t.number().check(Number.NaN)).toThrow("expected number");
		expect(() => t.boolean().check(0)).toThrow("expected boolean");
		expect(() => t.string().check(null)).toThrow("expected string");
		expect(() => t.string().check(undefined)).toThrow("expected string");
	});

	it("returns the object when every property checks out", () => {
		const todo = t.object({ title: t.string(), done: t.boolean() });
		expect(todo.check({ title: "milk", done: false })).toEqual({
			title: "milk",
			done: false,
		});
	});

	it("throws with the failing field path when a value is not a valid object", () => {
		const todo = t.object({ title: t.string() });
		expect(() => todo.check(null)).toThrow("expected object");
		expect(() => todo.check([])).toThrow("expected object");
		expect(() => todo.check({ title: 42 })).toThrow("title: expected string");
		expect(() => todo.check({})).toThrow("title: expected string");
	});

	it("throws with a dotted path when a nested object field is wrong", () => {
		const wrapper = t.object({ todo: t.object({ title: t.string() }) });
		expect(() => wrapper.check({ todo: { title: 42 } })).toThrow(
			"todo.title: expected string",
		);
	});

	it("drops extra keys when checking an object", () => {
		const todo = t.object({ title: t.string() });
		expect(todo.check({ title: "milk", extra: 1 })).toEqual({ title: "milk" });
	});

	it("passes matching arrays through and throws with the index of a bad item", () => {
		const nums = t.array(t.number());
		expect(nums.check([1, 2])).toEqual([1, 2]);
		expect(nums.check([])).toEqual([]);
		expect(() => nums.check("nope")).toThrow("expected array");
		expect(() => nums.check([1, "x"])).toThrow("1: expected number");
	});

	it("accepts undefined but still checks present values when optional", () => {
		const maybe = t.optional(t.string());
		expect(maybe.check(undefined)).toBeUndefined();
		expect(maybe.check("ada")).toBe("ada");
		expect(() => maybe.check(null)).toThrow("expected string");
	});

	it("decodes JSON strings when parsing objects and arrays", () => {
		const todo = t.object({ title: t.string() });
		expect(todo.parse('{"title":"milk"}')).toEqual({ title: "milk" });
		expect(t.array(t.number()).parse("[1,2]")).toEqual([1, 2]);
	});
});
