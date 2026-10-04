import { describe, expect, it } from "bun:test";
import { readdirSync, statSync } from "node:fs";
import { RuleDocument } from "../rule-document";
import { catalog } from "./index";

describe("catalog", () => {
	const parsed = Object.entries(catalog).map(([id, files]) =>
		RuleDocument.parse(files["RULE.md"] ?? "", { id }),
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
		// two are about a stack and a program that a project may not have.
		expect(notRecommended).toEqual([
			"dev-servers-find-a-port",
			"reactive-over-use-state",
		]);
	});

	it("bundles every file in each rule's directory, so none is left behind", () => {
		const declared = Object.fromEntries(
			Object.entries(catalog).map(([id, files]) => [
				id,
				Object.keys(files).toSorted(),
			]),
		);
		const onDisk = Object.fromEntries(
			Object.keys(catalog).map((id) => {
				const dir = `${import.meta.dir}/${id}`;
				return [
					id,
					readdirSync(dir, { recursive: true, encoding: "utf8" })
						.filter((path) => statSync(`${dir}/${path}`).isFile())
						.toSorted(),
				];
			}),
		);

		expect(declared).toEqual(onDisk);
	});
});
