import { beforeEach, describe, expect, it } from "bun:test";
import { color } from "./color";

describe("color", () => {
	// these assert on escape codes, so start from a known environment: an
	// ambient NO_COLOR would otherwise fail the suite it is meant to serve
	beforeEach(() => {
		delete process.env.NO_COLOR;
	});

	it("strips every wrapper, including nested ones", () => {
		const painted = color.green(`ok ${color.dim("(1s)")}`);

		expect(painted).not.toBe("ok (1s)");
		expect(color.strip(painted)).toBe("ok (1s)");
	});

	it("wraps magenta in its own foreground code", () => {
		expect(color.magenta("marker")).toBe("\u001B[35mmarker\u001B[39m");
	});

	it("emits plain text when NO_COLOR is set", () => {
		process.env.NO_COLOR = "1";

		expect(color.green(`ok ${color.dim("(1s)")}`)).toBe("ok (1s)");
	});
});
