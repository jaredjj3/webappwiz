import { describe, expect, it } from "bun:test";
import { bump } from "./version";

describe("version", () => {
	it("bumps the patch", () => {
		expect(bump("1.2.3", "patch")).toBe("1.2.4");
	});

	it("bumps the minor and clears the patch", () => {
		expect(bump("1.2.3", "minor")).toBe("1.3.0");
	});

	it("bumps the major and clears the rest", () => {
		expect(bump("1.2.3", "major")).toBe("2.0.0");
	});

	it("refuses a version that is not major.minor.patch", () => {
		expect(() => bump("1.2", "patch")).toThrow('invalid version: "1.2"');
	});

	it("refuses a prerelease rather than truncating it", () => {
		expect(() => bump("1.2.3-beta.1", "patch")).toThrow("invalid version");
	});
});
