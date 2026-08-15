import { beforeEach, describe, expect, it } from "bun:test";
import { ManifestWorkspace } from "./manifest-workspace";
import { WorkspaceHarness } from "./workspace-harness";

describe("workspace", () => {
	let harness: WorkspaceHarness;

	beforeEach(async () => {
		harness = await WorkspaceHarness.seeded();
	});

	it("climbs to the manifest that declares the workspaces", async () => {
		const workspace = await ManifestWorkspace.at("/repo/packages/one", {
			fs: harness.fs,
		});

		expect(workspace.root).toBe("/repo");
	});

	it("says so when nothing above is a workspace", async () => {
		await expect(
			ManifestWorkspace.at("/elsewhere", { fs: harness.fs }),
		).rejects.toThrow("no workspace above /elsewhere");
	});

	it("falls back to the nearest named manifest as a workspace of one", async () => {
		await harness.write("/solo", { name: "@scope/solo", version: "3.0.0" });

		const workspace = await ManifestWorkspace.at("/solo/src", {
			fs: harness.fs,
		});

		expect(workspace.root).toBe("/solo");
		expect(await workspace.packages()).toEqual([
			{ name: "@scope/solo", dir: "/solo", private: false, published: false },
		]);
	});

	it("stamps a workspace of one at its root, once", async () => {
		await harness.write("/solo", { name: "@scope/solo", version: "3.0.0" });
		const workspace = new ManifestWorkspace("/solo", { fs: harness.fs });

		await workspace.setVersion("3.1.0");

		expect(await harness.manifest("/solo")).toEqual({
			name: "@scope/solo",
			version: "3.1.0",
		});
	});

	it("reads the version off the root manifest", async () => {
		expect(await harness.workspace.version()).toBe("1.2.3");
	});

	it("finds every package the workspaces glob covers", async () => {
		expect(await harness.workspace.packages()).toEqual([
			{
				name: "@scope/one",
				dir: "/repo/packages/one",
				private: false,
				published: false,
			},
			{
				name: "@scope/two",
				dir: "/repo/packages/two",
				private: true,
				published: false,
			},
		]);
	});

	it("skips a directory with no manifest of its own", async () => {
		await harness.fs.mkdir("/repo/packages/three");

		const packages = await harness.workspace.packages();

		expect(packages.map((pkg) => pkg.name)).toEqual([
			"@scope/one",
			"@scope/two",
		]);
	});

	it("stamps the new version on the root", async () => {
		await harness.workspace.setVersion("2.0.0");

		expect(await harness.versionAt("/repo")).toBe("2.0.0");
	});

	it("stamps the new version on every package", async () => {
		await harness.workspace.setVersion("2.0.0");

		expect(await harness.versionAt("/repo/packages/one")).toBe("2.0.0");
		expect(await harness.versionAt("/repo/packages/two")).toBe("2.0.0");
	});

	it("stamps private packages too, so nothing drifts out of lockstep", async () => {
		await harness.workspace.setVersion("2.0.0");

		expect(await harness.manifest("/repo/packages/two")).toEqual({
			name: "@scope/two",
			version: "2.0.0",
			private: true,
		});
	});
});
