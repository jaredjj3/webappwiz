import { describe, expect, it } from "bun:test";

import { cx } from "./index";

describe("cx", () => {
	it("joins the truthy parts with a space", () => {
		expect(cx("btn", "btn-primary")).toBe("btn btn-primary");
	});

	it("drops everything falsy, numbers included", () => {
		expect(cx("btn", false, null, undefined, "", 0)).toBe("btn");
	});

	it("takes the truthy keys of an object", () => {
		expect(cx("btn", { "btn-lg": true, "btn-sm": false })).toBe("btn btn-lg");
	});

	it("flattens arrays however deeply they nest", () => {
		expect(cx(["btn", ["btn-lg", [false, "shadow"]]])).toBe(
			"btn btn-lg shadow",
		);
	});

	it("keeps a truthy number, since only falsy parts are dropped", () => {
		expect(cx(1, "col")).toBe("1 col");
	});

	it("is an empty string when nothing survives", () => {
		expect(cx()).toBe("");
		expect(cx(false, {}, [])).toBe("");
	});
});
