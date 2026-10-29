import { describe, expect, it } from "bun:test";
import { MemoryLogger } from "webappwiz/log";
import { Cut } from "../cut";
import { FakeRegistry } from "./fake-registry";
import { RegistryArtifact } from "./registry-artifact";

describe("registry artifact", () => {
	const cutting = () =>
		new Cut(
			"1.2.4",
			[
				{
					name: "@scope/one",
					dir: "/repo/packages/one",
					private: false,
					dependencies: [],
				},
			],
			{ log: new MemoryLogger() },
		);

	it("publishes the one package it was declared for", async () => {
		const registry = new FakeRegistry();
		const artifact = new RegistryArtifact("@scope/one", registry);

		expect(artifact.packages).toEqual(["@scope/one"]);
		expect(artifact.stage).toBe("publish");
		await artifact.publish(cutting());
		expect(registry.publishes).toEqual(["/repo/packages/one"]);
	});

	it("skips a version the registry already has", async () => {
		const registry = new FakeRegistry();
		registry.has.add("@scope/one@1.2.4");

		await new RegistryArtifact("@scope/one", registry).publish(cutting());

		expect(registry.publishes).toEqual([]);
	});

	it("refuses a package the cut holds no directory for", async () => {
		const artifact = new RegistryArtifact("@scope/gone", new FakeRegistry());

		await expect(artifact.publish(cutting())).rejects.toThrow(
			'"@scope/gone" has no workspace package',
		);
	});

	it("publishes and moves on, waiting on no install to resolve it", async () => {
		const cut = cutting();
		const registry = new FakeRegistry();
		const steps = new RegistryArtifact("@scope/one", registry).steps(cut);

		expect(steps.map((step) => step.name)).toEqual([
			"Publish @scope/one@1.2.4",
		]);
		expect(steps[0]?.check).toBeUndefined();
		await steps[0]?.run(cut);
		expect(registry.publishes).toEqual(["/repo/packages/one"]);
	});

	it("answers what is live with what the registry holds", async () => {
		const registry = new FakeRegistry();
		const artifact = new RegistryArtifact("@scope/one", registry);

		expect(await artifact.deployed()).toBeUndefined();
		registry.latest.set("@scope/one", "1.2.3");
		expect(await artifact.deployed()).toBe("1.2.3");
		expect(artifact.name).toBe("@scope/one");
	});
});
