import { describe, expect, it } from "bun:test";
import { MemoryLogger } from "webappwiz/log";
import { Duration } from "webappwiz/time";
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

	it("stages then waits for approval when the registry stages", async () => {
		const cut = cutting();
		const registry = new FakeRegistry();
		registry.staging = () => ({ stageId: "st-1", url: "https://npm/one" });
		const steps = new RegistryArtifact("@scope/one", registry).steps(cut);
		const staged: unknown[] = [];

		expect(steps.map((step) => [step.name, step.stage])).toEqual([
			["Stage @scope/one@1.2.4", "publish"],
			["Live @scope/one@1.2.4", "approve"],
		]);
		await steps[0]?.run(cut, {
			staged: async (info) => {
				staged.push(info);
			},
		});
		expect(staged).toEqual([
			{
				package: "@scope/one",
				version: "1.2.4",
				stageId: "st-1",
				url: "https://npm/one",
			},
		]);
		expect(await steps[1]?.check?.(cut, Duration.zero())).toMatchObject({
			passed: false,
		});
		registry.has.add("@scope/one@1.2.4");
		expect(await steps[1]?.check?.(cut, Duration.secs(10))).toEqual({
			passed: true,
		});
	});

	it("is done once the registry accepts a version, though it is still scanning it", async () => {
		const cut = cutting();
		const registry = new FakeRegistry();
		const steps = new RegistryArtifact("@scope/one", registry).steps(cut);

		expect(steps.map((step) => step.name)).toEqual([
			"Publish @scope/one@1.2.4",
		]);
	});

	it("says a version may be held once it is long past the usual scan", async () => {
		const log = new MemoryLogger();
		const cut = new Cut("1.2.4", [], { log });
		const registry = new FakeRegistry();
		const artifact = new RegistryArtifact("@scope/one", registry);

		expect(await artifact.live(cut, Duration.mins(19))).toMatchObject({
			status: "pending",
		});
		expect(await artifact.live(cut, Duration.mins(20))).toEqual({
			passed: false,
			status: "held",
			url: "https://registry/@scope/one/v/1.2.4",
		});
		await artifact.live(cut, Duration.mins(22));
		const held = log.entries
			.map((entry) => String(entry.message))
			.filter((line) => line.includes("for review"));
		expect(held).toHaveLength(1);
		expect(held[0]).toContain("https://registry/@scope/one/v/1.2.4");
	});

	it("waits on a version the registry already took, publishing nothing", async () => {
		const registry = new FakeRegistry();
		registry.accepted.add("/repo/packages/one");

		await new RegistryArtifact("@scope/one", registry).publish(cutting());

		expect(registry.publishes).toEqual([]);
	});
});
