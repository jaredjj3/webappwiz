import { describe, expect, it } from "bun:test";
import { Rule } from "../rule";
import { catalog } from "./index";

describe("catalog", () => {
	const parsed = Object.entries(catalog).map(([id, doc]) =>
		Rule.parse(doc, { id }),
	);

	it("holds a rule under every id, each parsing as its own directory's", () => {
		expect(parsed.map((rule) => rule.id)).toEqual(Object.keys(catalog));
	});

	it("stamps every rule with the release it shipped in", () => {
		expect(parsed.map((rule) => rule.version)).not.toContain(null);
	});
});
