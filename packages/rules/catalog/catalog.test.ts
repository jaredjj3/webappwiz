import { describe, expect, it } from "bun:test";
import { readdirSync, statSync } from "node:fs";
import { Rule } from "../rule";
import { catalog } from "./index";

describe("catalog", () => {
	const parsed = Object.entries(catalog).map(([id, files]) =>
		Rule.parse(files["RULE.md"] ?? "", { id }),
	);

	it("holds a rule under every id, each parsing as its own directory's", () => {
		expect(parsed.map((rule) => rule.id)).toEqual(Object.keys(catalog));
	});

	it("stamps every rule with the release it shipped in", () => {
		expect(parsed.map((rule) => rule.version)).not.toContain(null);
	});

	it("recommends every rule a project cannot tell it does not want", () => {
		const notRecommended = parsed
			.filter((rule) => !rule.recommended)
			.map((rule) => rule.id);

		// The rest read on any TypeScript, so a project takes them on faith;
		// two are about a stack and a program that a project may not have, and
		// one is an example that asks for nothing.
		expect(notRecommended).toEqual([
			"dev-servers-find-a-port",
			"example-script",
			"reactive-over-use-state",
		]);
	});

	it("bundles every file in each rule's directory, so none is left behind", () => {
		for (const [id, files] of Object.entries(catalog)) {
			const dir = `${import.meta.dir}/${id}`;
			const onDisk = readdirSync(dir, { recursive: true, encoding: "utf8" })
				.filter((path) => statSync(`${dir}/${path}`).isFile())
				.toSorted();

			expect(Object.keys(files).toSorted()).toEqual(onDisk);
		}
	});
});
