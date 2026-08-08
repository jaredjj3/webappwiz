import { expect, test } from "bun:test";
import { color } from "./color";

test("strip undoes every wrapper, including nested ones", () => {
	const painted = color.green(`ok ${color.dim("(1s)")}`);

	expect(painted).not.toBe("ok (1s)");
	expect(color.strip(painted)).toBe("ok (1s)");
});
