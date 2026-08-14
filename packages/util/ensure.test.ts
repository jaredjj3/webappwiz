import { describe, expect, it } from "bun:test";

import { AssertError, ensure } from "./index";

describe("ensure", () => {
	it("returns the number it checked", () => {
		expect(ensure.integer(7)).toBe(7);
		expect(ensure.inRange(2, 1, 3)).toBe(2);
	});

	it("returns the value it checked for presence", () => {
		expect(ensure.present("hi")).toBe("hi");
	});

	it("throws on the same conditions assert does", () => {
		expect(() => ensure.present(null)).toThrow(AssertError);
		expect(() => ensure.integer(1.5)).toThrow(AssertError);
	});
});
