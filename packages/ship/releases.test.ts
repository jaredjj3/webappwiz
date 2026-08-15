import { describe, expect, it } from "bun:test";
import { FakeRegistry } from "./registry/fake-registry";
import { releases } from "./releases";

describe("releases", () => {
	it("declares a package, wherever it goes", () => {
		expect(releases.npm("@scope/one").packages).toEqual(["@scope/one"]);
		expect(releases.custom("@scope/two", new FakeRegistry()).packages).toEqual([
			"@scope/two",
		]);
	});

	it("composes the declarations into one release", () => {
		const release = releases.lockstep(
			releases.npm("@scope/one"),
			releases.custom("@scope/two", new FakeRegistry()),
			releases.git(),
			releases.github(),
		);

		expect(release.packages).toEqual(["@scope/one", "@scope/two"]);
	});
});
