import { expect, test } from "bun:test";

import { t } from "./t";

test("string passes the raw arg through", () => {
	expect(t.string().parse("ada")).toBe("ada");
	expect(t.string().parse("")).toBe("");
});

test("number parses numeric forms", () => {
	expect(t.number().parse("42")).toBe(42);
	expect(t.number().parse("-1.5")).toBe(-1.5);
	expect(t.number().parse("0x10")).toBe(16);
});

test("number rejects non-numbers with a readable message", () => {
	expect(() => t.number().parse("abc")).toThrow('expected a number, got "abc"');
});

test("boolean is a presence flag: --loud is true, --loud=false is false", () => {
	expect(t.boolean().parse("")).toBe(true);
	expect(t.boolean().parse("true")).toBe(true);
	expect(t.boolean().parse("false")).toBe(false);
});

test("each call yields an independent schema instance", () => {
	expect(t.string()).not.toBe(t.string());
});

test("check accepts values of the right type", () => {
	expect(t.string().check("ada")).toBe("ada");
	expect(t.number().check(42)).toBe(42);
	expect(t.boolean().check(false)).toBe(false);
});

test("check rejects wrong types", () => {
	expect(() => t.string().check(42)).toThrow("expected string");
	expect(() => t.number().check("42")).toThrow("expected number");
	expect(() => t.number().check(Number.NaN)).toThrow("expected number");
	expect(() => t.boolean().check(0)).toThrow("expected boolean");
	expect(() => t.string().check(null)).toThrow("expected string");
	expect(() => t.string().check(undefined)).toThrow("expected string");
});

test("object checks each property", () => {
	const todo = t.object({ title: t.string(), done: t.boolean() });
	expect(todo.check({ title: "milk", done: false })).toEqual({
		title: "milk",
		done: false,
	});
});

test("object rejects non-objects and reports field paths", () => {
	const todo = t.object({ title: t.string() });
	expect(() => todo.check(null)).toThrow("expected object");
	expect(() => todo.check([])).toThrow("expected object");
	expect(() => todo.check({ title: 42 })).toThrow("title: expected string");
	expect(() => todo.check({})).toThrow("title: expected string");
});

test("nested objects report dotted paths", () => {
	const wrapper = t.object({ todo: t.object({ title: t.string() }) });
	expect(() => wrapper.check({ todo: { title: 42 } })).toThrow(
		"todo.title: expected string",
	);
});

test("object drops extra keys", () => {
	const todo = t.object({ title: t.string() });
	expect(todo.check({ title: "milk", extra: 1 })).toEqual({ title: "milk" });
});

test("array checks items and reports the index", () => {
	const nums = t.array(t.number());
	expect(nums.check([1, 2])).toEqual([1, 2]);
	expect(nums.check([])).toEqual([]);
	expect(() => nums.check("nope")).toThrow("expected array");
	expect(() => nums.check([1, "x"])).toThrow("1: expected number");
});

test("optional allows undefined but still checks present values", () => {
	const maybe = t.optional(t.string());
	expect(maybe.check(undefined)).toBeUndefined();
	expect(maybe.check("ada")).toBe("ada");
	expect(() => maybe.check(null)).toThrow("expected string");
});

test("object and array parse decode JSON strings", () => {
	const todo = t.object({ title: t.string() });
	expect(todo.parse('{"title":"milk"}')).toEqual({ title: "milk" });
	expect(t.array(t.number()).parse("[1,2]")).toEqual([1, 2]);
});
