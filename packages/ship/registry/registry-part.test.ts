import { describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { Cut } from "../cut";
import { FakeRegistry } from "./fake-registry";
import { RegistryPart } from "./registry-part";

describe("registry part", () => {
	const cutting = () =>
		new Cut(
			"1.2.4",
			[{ name: "@scope/one", dir: "/repo/packages/one", private: false }],
			{ log: new MemoryLogger() },
		);

	it("publishes the one package it was declared for", async () => {
		const registry = new FakeRegistry();
		const part = new RegistryPart("@scope/one", registry);

		expect(part.packages).toEqual(["@scope/one"]);
		expect(part.stage).toBe("publish");
		await part.publish(cutting());
		expect(registry.publishes).toEqual(["/repo/packages/one"]);
	});

	it("skips a version the registry already has", async () => {
		const registry = new FakeRegistry();
		registry.has.add("@scope/one@1.2.4");

		await new RegistryPart("@scope/one", registry).publish(cutting());

		expect(registry.publishes).toEqual([]);
	});

	it("refuses a package the cut holds no directory for", async () => {
		const part = new RegistryPart("@scope/gone", new FakeRegistry());

		await expect(part.publish(cutting())).rejects.toThrow(
			'"@scope/gone" has no workspace package',
		);
	});
});
