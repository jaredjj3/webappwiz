import { describe, expect, it } from "bun:test";
import { mode } from "./mode";

describe("mode", () => {
	it("runs when nothing says otherwise", () => {
		expect(mode({})).toBe("run");
	});

	it("runs on the agent a caller names", () => {
		expect(mode({ agent: "haiku" })).toBe("run");
		expect(mode({ exec: "codex exec" })).toBe("run");
	});

	it("prints under --print", () => {
		expect(mode({ print: true })).toBe("print");
	});

	it("measures under --estimate", () => {
		expect(mode({ estimate: true })).toBe("estimate");
	});

	it("refuses to both print and run", () => {
		expect(() => mode({ print: true, agent: "haiku" })).toThrow(
			"--print and --agent are different things to do with one run, so pass one",
		);
		expect(() => mode({ print: true, exec: "codex exec" })).toThrow(
			"--print and --exec are different things",
		);
	});

	it("refuses to both print and measure", () => {
		expect(() => mode({ print: true, estimate: true })).toThrow(
			"--print and --estimate are different things",
		);
	});

	it("refuses to both measure and run", () => {
		expect(() => mode({ estimate: true, agent: "haiku" })).toThrow(
			"--estimate and --agent are different things",
		);
	});

	it("refuses two ways of naming the agent", () => {
		expect(() => mode({ agent: "haiku", exec: "codex exec" })).toThrow(
			"--agent and --exec are different things",
		);
	});
});
