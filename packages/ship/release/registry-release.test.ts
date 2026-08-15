import { describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { Cut } from "../cut";
import { FakeRegistry } from "../registry/fake-registry";
import { RegistryRelease } from "./registry-release";

describe("registry release", () => {
	const cutting = () =>
		new Cut(
			"1.2.4",
			[{ name: "@scope/one", dir: "/repo/packages/one", private: false }],
			{ log: new MemoryLogger() },
		);

	it("publishes the one package it was declared for", async () => {
		const registry = new FakeRegistry();
		const release = new RegistryRelease("@scope/one", registry);

		expect(release.packages).toEqual(["@scope/one"]);
		await release.publish(cutting());
		expect(registry.publishes).toEqual(["/repo/packages/one"]);
	});

	it("skips a version the registry already has", async () => {
		const registry = new FakeRegistry();
		registry.has.add("@scope/one@1.2.4");

		await new RegistryRelease("@scope/one", registry).publish(cutting());

		expect(registry.publishes).toEqual([]);
	});

	it("refuses a package the cut holds no directory for", async () => {
		const release = new RegistryRelease("@scope/gone", new FakeRegistry());

		await expect(release.publish(cutting())).rejects.toThrow(
			'"@scope/gone" has no workspace package',
		);
	});
});
