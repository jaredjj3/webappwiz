import { describe, expect, it } from "bun:test";
import { ObjectsOverCallbacks } from "./objects-over-callbacks";

// The document's examples are the rest of this rule's suite: recommended.test.ts
// runs every Good block through the check. What is left here is where a finding
// points, and the token edges no document should have to teach.
describe("objects-over-callbacks", () => {
	it("points at a constructor taking a function-typed parameter", () => {
		const text = [
			"class Stamper {",
			"\tconstructor(private now: () => Date) {}",
			"}",
		].join("\n");

		expect(new ObjectsOverCallbacks().check(text)).toEqual([
			{
				line: 2,
				column: 2,
				message: expect.stringContaining("name an interface"),
			},
		]);
	});

	it("catches a function hiding in a default value", () => {
		const text = [
			"class Stamper {",
			"\tconstructor(private now = () => new Date()) {}",
			"}",
		].join("\n");

		expect(new ObjectsOverCallbacks().check(text)).toHaveLength(1);
	});

	it("does not mistake an arrow in the body for a parameter", () => {
		const text = [
			"class Poller {",
			"\tconstructor(private clock: Clock) {",
			"\t\tthis.stop = () => clock.clear();",
			"\t}",
			"}",
		].join("\n");

		expect(new ObjectsOverCallbacks().check(text)).toEqual([]);
	});

	it("leaves function parameters outside constructors to the agent", () => {
		const text = "function retry(run: () => void) { run(); }";

		expect(new ObjectsOverCallbacks().check(text)).toEqual([]);
	});
});
