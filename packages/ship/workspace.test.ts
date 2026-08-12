import { beforeEach, describe, expect, it } from "bun:test";
import { FakeFs } from "@webappwiz/sys/testing";
import { Workspace } from "./workspace";

let fs: FakeFs;

async function seed(dir: string, manifest: object): Promise<void> {
	await fs.mkdir(dir);
	await fs.write(`${dir}/package.json`, JSON.stringify(manifest));
}

beforeEach(async () => {
	fs = new FakeFs();
	await seed("/repo", { version: "1.2.3", workspaces: ["packages/*"] });
	await seed("/repo/packages/one", { name: "@scope/one", version: "1.2.3" });
	await seed("/repo/packages/two", {
		name: "@scope/two",
		version: "1.2.3",
		private: true,
	});
});

describe("workspace", () => {
	it("climbs to the manifest that declares the workspaces", async () => {
		const workspace = await Workspace.at(fs, "/repo/packages/one");
		expect(workspace.root).toBe("/repo");
	});

	it("says so when nothing above is a workspace", async () => {
		await expect(Workspace.at(fs, "/elsewhere")).rejects.toThrow(
			"no workspace above /elsewhere",
		);
	});

	it("reads the version off the root manifest", async () => {
		expect(await new Workspace(fs, "/repo").version()).toBe("1.2.3");
	});

	it("finds every package the workspaces glob covers", async () => {
		expect(await new Workspace(fs, "/repo").packages()).toEqual([
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
		await fs.mkdir("/repo/packages/three");
		const packages = await new Workspace(fs, "/repo").packages();
		expect(packages.map((pkg) => pkg.name)).toEqual([
			"@scope/one",
			"@scope/two",
		]);
	});

	it("stamps the new version on the root and every package", async () => {
		await new Workspace(fs, "/repo").setVersion("2.0.0");
		for (const dir of ["/repo", "/repo/packages/one", "/repo/packages/two"]) {
			const manifest = JSON.parse(await fs.read(`${dir}/package.json`));
			expect(manifest.version).toBe("2.0.0");
		}
	});

	it("stamps private packages too, so nothing drifts out of lockstep", async () => {
		await new Workspace(fs, "/repo").setVersion("2.0.0");
		const manifest = JSON.parse(
			await fs.read("/repo/packages/two/package.json"),
		);
		expect(manifest).toEqual({
			name: "@scope/two",
			version: "2.0.0",
			private: true,
		});
	});
});
