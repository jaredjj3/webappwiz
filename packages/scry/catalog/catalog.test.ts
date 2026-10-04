import { describe, expect, it } from "bun:test";
import { readdirSync, statSync } from "node:fs";
import { DeclaredRule } from "../declared-rule";
import { catalog } from "./index";

describe("catalog", () => {
	const declared = Object.entries(catalog).map(([id, { rule }]) =>
		DeclaredRule.of(id, rule),
	);

	it("holds a rule under every id, each declaring its settings", () => {
		expect(declared.map((rule) => rule.id)).toEqual(Object.keys(catalog));
	});

	it("stamps every rule's RULE.md with the release it shipped in", () => {
		const unstamped = Object.entries(catalog)
			.filter(
				([, { files }]) =>
					!/^---\nversion: .+\n---\n/.test(files["RULE.md"] ?? ""),
			)
			.map(([id]) => id);

		expect(unstamped).toEqual([]);
	});

	it("recommends every rule a project cannot tell it does not want", () => {
		const notRecommended = declared
			.filter((rule) => !rule.recommended)
			.map((rule) => rule.id);

		// The rest read on any TypeScript, so a project takes them on faith;
		// this one is about a stack that a project may not have.
		expect(notRecommended).toEqual(["reactive-over-use-state"]);
	});

	it("bundles every file in each rule's directory, so none is left behind", () => {
		const declared = Object.fromEntries(
			Object.entries(catalog).map(([id, { files }]) => [
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
