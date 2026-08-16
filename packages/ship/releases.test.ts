import { describe, expect, it } from "bun:test";
import { FakePart } from "./part/fake-part";
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

	it("runs the parts by stage, not by the order they were declared", () => {
		const release = releases.lockstep(
			releases.github(),
			releases.git(),
			releases.npm("@scope/one"),
		);

		expect(release.parts.map((part) => part.stage)).toEqual([
			"publish",
			"tag",
			"notes",
		]);
	});

	it("takes a bare part beside the composed ones, at the publish stage", () => {
		const docker = new FakePart();
		const release = releases.lockstep(releases.git(), docker);

		expect(release.parts[0]).toBe(docker);
		expect(release.parts[1]?.stage).toBe("tag");
	});
});
