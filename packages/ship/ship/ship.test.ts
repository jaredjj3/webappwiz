import { describe, expect, it } from "bun:test";
import { CliGithub } from "../github/cli-github";
import { FakeRegistry } from "../registry/fake-registry";
import { NpmRegistry } from "../registry/npm-registry";
import { LockstepShip } from "./lockstep-ship";
import { Ship } from "./ship";

describe("Ship", () => {
	it("declares npm and custom targets", () => {
		const registry = new FakeRegistry();
		expect(Ship.custom("@scope/one", registry)).toEqual({
			name: "@scope/one",
			registry,
		});
		expect(Ship.npm("@scope/one").registry).toBeInstanceOf(NpmRegistry);
	});

	it("composes targets and the GitHub step into a lockstep release", () => {
		expect(Ship.github()).toBeInstanceOf(CliGithub);
		expect(Ship.lockstep(Ship.npm("@scope/one"), Ship.github())).toBeInstanceOf(
			LockstepShip,
		);
	});
});
