import { describe, expect, it } from "bun:test";
import { Rule } from "./rule";
import { template } from "./template";

describe("template", () => {
	it("parses as a rule under the name it was made for", () => {
		const rule = Rule.parse(template("no-default-exports"), {
			id: "no-default-exports",
		});

		expect(rule.id).toEqual("no-default-exports");
		expect(rule.version).toBeNull();
	});

	it("titles the rule after its name", () => {
		expect(template("no-default-exports")).toContain("# No default exports");
	});

	it("says what goes where, for whoever fills it in", () => {
		expect(template("no-foo")).toContain("Delete this comment.");
	});

	it("refuses a name that would not be a rule id", () => {
		expect(() => template("No Foo")).toThrow('"No Foo" is not kebab case');
	});
});
