import { beforeEach, describe, expect, it } from "bun:test";
import type { Fs } from "webappwiz/system";
import { FakeFs } from "webappwiz/system/testing";
import { ManifestWorkspace } from "./manifest-workspace";

/** A filesystem that takes every write but the one path it is given. */
class PartialFs extends FakeFs {
	refuses?: string;

	override async write(path: string, data: string): Promise<void> {
		if (path === this.refuses) {
			throw new Error(`no space left on device: ${path}`);
		}
		await super.write(path, data);
	}
}

async function write(fs: Fs, dir: string, manifest: object): Promise<void> {
	await fs.mkdir(dir);
	await fs.write(`${dir}/package.json`, JSON.stringify(manifest));
}

async function manifest(fs: Fs, dir: string): Promise<Record<string, unknown>> {
	return JSON.parse(await fs.read(`${dir}/package.json`));
}

async function versionAt(fs: Fs, dir: string): Promise<unknown> {
	return (await manifest(fs, dir)).version;
}

/**
 * Seeds a workspace at 1.2.3 onto `fs`: a root at `/repo` declaring
 * `packages/*`, a public `@scope/one` under it, and a private `@scope/two`.
 */
async function seeded(fs: Fs): Promise<void> {
	await write(fs, "/repo", { version: "1.2.3", workspaces: ["packages/*"] });
	await write(fs, "/repo/packages/one", {
		name: "@scope/one",
		version: "1.2.3",
	});
	await write(fs, "/repo/packages/two", {
		name: "@scope/two",
		version: "1.2.3",
		private: true,
	});
}

describe("workspace", () => {
	let fs: FakeFs;
	/** The workspace rooted at `/repo`, which is the one every test reads. */
	let workspace: ManifestWorkspace;

	beforeEach(async () => {
		fs = new FakeFs();
		await seeded(fs);
		workspace = new ManifestWorkspace("/repo", { fs });
	});

	it("climbs to the manifest that declares the workspaces", async () => {
		const found = await ManifestWorkspace.at("/repo/packages/one", { fs });

		expect(found.root).toBe("/repo");
	});

	it("says so when nothing above is a workspace", async () => {
		await expect(ManifestWorkspace.at("/elsewhere", { fs })).rejects.toThrow(
			"no workspace above /elsewhere",
		);
	});

	it("falls back to the nearest named manifest as a workspace of one", async () => {
		await write(fs, "/solo", { name: "@scope/solo", version: "3.0.0" });

		const found = await ManifestWorkspace.at("/solo/src", { fs });

		expect(found.root).toBe("/solo");
		expect(await found.packages()).toEqual([
			{ name: "@scope/solo", dir: "/solo", private: false, dependencies: [] },
		]);
	});

	it("stamps a workspace of one at its root, once", async () => {
		await write(fs, "/solo", { name: "@scope/solo", version: "3.0.0" });
		const solo = new ManifestWorkspace("/solo", { fs });

		await solo.setVersion("3.1.0");

		expect(await manifest(fs, "/solo")).toEqual({
			name: "@scope/solo",
			version: "3.1.0",
		});
	});

	it("reads the version off the root manifest", async () => {
		expect(await workspace.version()).toBe("1.2.3");
	});

	it("finds every package the workspaces glob covers", async () => {
		expect(await workspace.packages()).toEqual([
			{
				name: "@scope/one",
				dir: "/repo/packages/one",
				private: false,
				dependencies: [],
			},
			{
				name: "@scope/two",
				dir: "/repo/packages/two",
				private: true,
				dependencies: [],
			},
		]);
	});

	it("reports the siblings a package depends on, peers included", async () => {
		await write(fs, "/repo/packages/one", {
			name: "@scope/one",
			dependencies: { "@scope/two": "workspace:^", chalk: "^5.0.0" },
			peerDependencies: { typescript: "^7" },
			devDependencies: { "@scope/two": "workspace:^" },
		});

		const [one] = await workspace.packages();

		// chalk and typescript are already on the registry, so neither can hold a
		// release back; the sibling is the only name that orders anything.
		expect(one?.dependencies).toEqual(["@scope/two"]);
	});

	it("counts a sibling named only as a peer", async () => {
		await write(fs, "/repo/packages/one", {
			name: "@scope/one",
			peerDependencies: { "@scope/two": "workspace:^" },
		});

		const [one] = await workspace.packages();

		expect(one?.dependencies).toEqual(["@scope/two"]);
	});

	it("skips a directory with no manifest of its own", async () => {
		await fs.mkdir("/repo/packages/three");

		const packages = await workspace.packages();

		expect(packages.map((pkg) => pkg.name)).toEqual([
			"@scope/one",
			"@scope/two",
		]);
	});

	it("stamps the new version on the root", async () => {
		await workspace.setVersion("2.0.0");

		expect(await versionAt(fs, "/repo")).toBe("2.0.0");
	});

	it("stamps the new version on every package", async () => {
		await workspace.setVersion("2.0.0");

		expect(await versionAt(fs, "/repo/packages/one")).toBe("2.0.0");
		expect(await versionAt(fs, "/repo/packages/two")).toBe("2.0.0");
	});

	it("leaves the root at the old version when a package will not stamp", async () => {
		const partial = new PartialFs();
		await seeded(partial);
		partial.refuses = "/repo/packages/two/package.json";
		const refused = new ManifestWorkspace("/repo", { fs: partial });

		await expect(refused.setVersion("2.0.0")).rejects.toThrow(
			"no space left on device",
		);

		// The root is the version a release reads. Left at 1.2.3, the next run
		// bumps to the same 2.0.0 and stamps everything; moved, it skips a version.
		expect(await versionAt(partial, "/repo")).toBe("1.2.3");
	});

	it("stamps private packages too, so nothing drifts out of lockstep", async () => {
		await workspace.setVersion("2.0.0");

		expect(await manifest(fs, "/repo/packages/two")).toEqual({
			name: "@scope/two",
			version: "2.0.0",
			private: true,
		});
	});
});
