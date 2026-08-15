import { describe, expect, it } from "bun:test";
import { FakeRegistry } from "../registry/fake-registry";
import { FakeRelease } from "../release/fake-release";
import { RegistryShip } from "./registry-ship";

describe("registry ship", () => {
	it("publishes the one package it was declared for", async () => {
		const registry = new FakeRegistry();
		const ship = new RegistryShip("@scope/one", registry);

		expect(ship.packages).toEqual(["@scope/one"]);
		await ship.run(new FakeRelease());
		expect(registry.publishes).toEqual(["/repo/packages/one"]);
	});

	it("skips a version the registry already has", async () => {
		const registry = new FakeRegistry();
		registry.has.add("@scope/one@1.2.4");

		await new RegistryShip("@scope/one", registry).run(new FakeRelease());

		expect(registry.publishes).toEqual([]);
	});

	it("refuses a package the release holds no directory for", async () => {
		const ship = new RegistryShip("@scope/gone", new FakeRegistry());

		await expect(ship.run(new FakeRelease())).rejects.toThrow(
			'"@scope/gone" has no workspace package',
		);
	});
});
