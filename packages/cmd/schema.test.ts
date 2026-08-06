import { expect, test } from "bun:test";

import { t } from "./schema";

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

test("boolean is a presence flag: only =false is false", () => {
	expect(t.boolean().parse("true")).toBe(true);
	expect(t.boolean().parse("")).toBe(true);
	expect(t.boolean().parse("false")).toBe(false);
});

test("each call yields an independent schema instance", () => {
	expect(t.string()).not.toBe(t.string());
});
