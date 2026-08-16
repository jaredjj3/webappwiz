import { describe, expect, it } from "bun:test";
import { order } from "./order";
import type { Package } from "./workspace/workspace";

describe("order", () => {
	const pkg = (name: string, ...dependencies: string[]): Package => ({
		name,
		dir: `/repo/packages/${name}`,
		private: false,
		dependencies,
	});

	const names = (packages: Package[]) => packages.map((one) => one.name);

	it("puts a package after everything it depends on", () => {
		const sorted = order([
			pkg("http", "time"),
			pkg("time", "disposable"),
			pkg("disposable"),
		]);

		expect(names(sorted)).toEqual(["disposable", "time", "http"]);
	});

	it("ignores dependencies from outside the workspace", () => {
		const sorted = order([pkg("aws", "aws-cdk-lib"), pkg("assert")]);

		expect(names(sorted)).toEqual(["assert", "aws"]);
	});

	it("breaks ties by name, so a resumed release meets the order it left", () => {
		const sorted = order([pkg("zeta"), pkg("alpha"), pkg("mid")]);

		expect(names(sorted)).toEqual(["alpha", "mid", "zeta"]);
	});

	it("orders the whole graph, not just the packages named first", () => {
		// `cli` is reachable only through `rules`, and sorts before it by name.
		const sorted = order([
			pkg("cli", "rules"),
			pkg("rules", "md"),
			pkg("md"),
			pkg("t"),
		]);

		expect(names(sorted)).toEqual(["md", "t", "rules", "cli"]);
	});

	it("refuses a cycle rather than picking an order that cannot work", () => {
		expect(() => order([pkg("one", "two"), pkg("two", "one")])).toThrow(
			"dependency cycle: one, two",
		);
	});
});
