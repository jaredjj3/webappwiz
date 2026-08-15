import { describe, expect, it } from "bun:test";
import { FakeRegistry } from "../registry/fake-registry";
import { ships } from "./ships";

describe("ships", () => {
	it("declares a package, wherever it goes", () => {
		expect(ships.npm("@scope/one").packages).toEqual(["@scope/one"]);
		expect(ships.custom("@scope/two", new FakeRegistry()).packages).toEqual([
			"@scope/two",
		]);
	});

	it("composes the declarations into one release", () => {
		const release = ships.lockstep(
			ships.npm("@scope/one"),
			ships.custom("@scope/two", new FakeRegistry()),
			ships.github(),
		);

		expect(release.packages).toEqual(["@scope/one", "@scope/two"]);
	});
});
