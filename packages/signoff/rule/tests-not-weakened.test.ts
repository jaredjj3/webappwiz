import { describe, expect, it } from "bun:test";
import type { Change, Changeset } from "../changeset";
import { TestsNotWeakened } from "./tests-not-weakened";

const changeset = (...changes: Change[]): Changeset => ({
	base: "main",
	changes,
});

const deleted = (path: string): Change => ({
	path,
	status: "deleted",
	added: [],
});

const added = (path: string, ...lines: string[]): Change => ({
	path,
	status: "modified",
	added: lines,
});

// The document says what the rule is. What is here is which change trips it,
// and where the finding points.
describe("tests-not-weakened", () => {
	const rule = new TestsNotWeakened();

	it("stops a deleted test whose subject the change leaves behind", () => {
		const found = rule.check(changeset(deleted("src/parse.test.ts")));

		expect(found).toEqual([
			{
				rule: "tests-not-weakened",
				file: "src/parse.test.ts",
				message: "test file deleted while src/parse.ts survives",
			},
		]);
	});

	it("lets a test go when the code it tested goes with it", () => {
		const found = rule.check(
			changeset(deleted("src/parse.test.ts"), deleted("src/parse.ts")),
		);

		expect(found).toEqual([]);
	});

	it("says nothing about a deleted file that was never a test", () => {
		expect(rule.check(changeset(deleted("src/parse.ts")))).toEqual([]);
	});

	it("stops a test the change turns off", () => {
		const found = rule.check(
			changeset(added("src/parse.test.ts", "\tit.skip('parses', () => {")),
		);

		expect(found.map((finding) => finding.message)).toEqual([
			".skip added to a test",
		]);
	});

	it("stops a suite the change narrows to one case", () => {
		const found = rule.check(
			changeset(added("src/parse.test.ts", "\tdescribe.only('parse', () => {")),
		);

		expect(found.map((finding) => finding.message)).toEqual([
			".only added to a test",
		]);
	});

	it("points at the added line that silenced the test", () => {
		const found = rule.check(
			changeset(
				added("src/parse.test.ts", "const x = 1;", "it.only('x', () =>"),
			),
		);

		expect(found[0]?.line).toBe(2);
	});

	it("leaves alone a skip the change did not add", () => {
		const found = rule.check(
			changeset(added("src/parse.test.ts", "it('parses', () => {")),
		);

		expect(found).toEqual([]);
	});

	it("reads a test written with test.skip as readily as it.skip", () => {
		const found = rule.check(
			changeset(added("src/parse.test.ts", "test.skip('parses', () => {")),
		);

		expect(found).toHaveLength(1);
	});

	it("knows a tsx test from the file it tests", () => {
		const found = rule.check(changeset(deleted("src/app.test.tsx")));

		expect(found[0]?.message).toBe(
			"test file deleted while src/app.tsx survives",
		);
	});
});
