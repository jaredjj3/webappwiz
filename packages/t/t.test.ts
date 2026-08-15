import { describe, expect, it } from "bun:test";

import { SchemaError } from "./schema-error";
import { t } from "./t";

describe("t", () => {
	it("returns the raw arg when parsing a string", () => {
		expect(t.string().coerce("ada")).toBe("ada");
		expect(t.string().coerce("")).toBe("");
	});

	it("converts decimal, negative, and hex forms when parsing a number", () => {
		expect(t.number().coerce("42")).toBe(42);
		expect(t.number().coerce("-1.5")).toBe(-1.5);
		expect(t.number().coerce("0x10")).toBe(16);
	});

	it("throws a readable message when a number arg is not numeric", () => {
		expect(() => t.number().coerce("abc")).toThrow(
			'expected a number, got "abc"',
		);
	});

	it("treats a bare boolean flag as true and --loud=false as false", () => {
		expect(t.boolean().coerce("")).toBe(true);
		expect(t.boolean().coerce("true")).toBe(true);
		expect(t.boolean().coerce("false")).toBe(false);
	});

	it("accepts a value an enum lists and names the rest when it does not", () => {
		const color = t.enum(["red", "green"]);
		expect(color.coerce("red")).toBe("red");
		expect(() => color.coerce("blue")).toThrow(
			'expected one of red, green, got "blue"',
		);
		expect(color.parse("green")).toBe("green");
		expect(() => color.parse("blue")).toThrow("expected one of red, green");
		expect(() => color.parse(42)).toThrow("expected one of red, green");
	});

	it("returns an independent schema instance on every call", () => {
		expect(t.string()).not.toBe(t.string());
	});

	it("returns the value when check gets the right type", () => {
		expect(t.string().parse("ada")).toBe("ada");
		expect(t.number().parse(42)).toBe(42);
		expect(t.boolean().parse(false)).toBe(false);
	});

	it("throws when check gets the wrong type", () => {
		expect(() => t.string().parse(42)).toThrow("expected string");
		expect(() => t.number().parse("42")).toThrow("expected number");
		expect(() => t.number().parse(Number.NaN)).toThrow("expected number");
		expect(() => t.boolean().parse(0)).toThrow("expected boolean");
		expect(() => t.string().parse(null)).toThrow("expected string");
		expect(() => t.string().parse(undefined)).toThrow("expected string");
	});

	it("returns the object when every property checks out", () => {
		const todo = t.object({ title: t.string(), done: t.boolean() });
		expect(todo.parse({ title: "milk", done: false })).toEqual({
			title: "milk",
			done: false,
		});
	});

	it("throws with the failing field path when a value is not a valid object", () => {
		const todo = t.object({ title: t.string() });
		expect(() => todo.parse(null)).toThrow("expected object");
		expect(() => todo.parse([])).toThrow("expected object");
		expect(() => todo.parse({ title: 42 })).toThrow("title: expected string");
		expect(() => todo.parse({})).toThrow("title: expected string");
	});

	it("throws with a dotted path when a nested object field is wrong", () => {
		const wrapper = t.object({ todo: t.object({ title: t.string() }) });
		expect(() => wrapper.parse({ todo: { title: 42 } })).toThrow(
			"todo.title: expected string",
		);
	});

	it("drops extra keys when checking an object", () => {
		const todo = t.object({ title: t.string() });
		expect(todo.parse({ title: "milk", extra: 1 })).toEqual({ title: "milk" });
	});

	it("passes matching arrays through and throws with the index of a bad item", () => {
		const nums = t.array(t.number());
		expect(nums.parse([1, 2])).toEqual([1, 2]);
		expect(nums.parse([])).toEqual([]);
		expect(() => nums.parse("nope")).toThrow("expected array");
		expect(() => nums.parse([1, "x"])).toThrow("1: expected number");
	});

	it("accepts undefined but still checks present values when optional", () => {
		const maybe = t.optional(t.string());
		expect(maybe.parse(undefined)).toBeUndefined();
		expect(maybe.parse("ada")).toBe("ada");
		expect(() => maybe.parse(null)).toThrow("expected string");
	});

	it("decodes JSON strings when parsing objects and arrays", () => {
		const todo = t.object({ title: t.string() });
		expect(todo.coerce('{"title":"milk"}')).toEqual({ title: "milk" });
		expect(t.array(t.number()).coerce("[1,2]")).toEqual([1, 2]);
	});

	it("coerces an empty string to a value, not to an absent optional", () => {
		expect(t.optional(t.string()).coerce("")).toBe("");
		expect(t.optional(t.number()).coerce("0")).toBe(0);
	});

	it("throws a SchemaError from coerce, not a bare Error", () => {
		expect(() => t.number().coerce("abc")).toThrow(SchemaError);
		expect(() => t.enum(["a", "b"]).coerce("c")).toThrow(SchemaError);
		expect(() => t.array(t.number()).coerce("{oops")).toThrow(SchemaError);
	});

	it("returns the error from safeParse rather than throwing it", () => {
		expect(t.number().safeParse(1)).toEqual({ success: true, data: 1 });

		const result = t.object({ n: t.number() }).safeParse({ n: "x" });
		expect(result.success).toBe(false);
		expect(result.success === false && result.error.path).toEqual(["n"]);
	});
});
