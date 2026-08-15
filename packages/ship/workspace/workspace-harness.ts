import { FakeFs } from "@webappwiz/system/testing";
import { ManifestWorkspace } from "./manifest-workspace";

/**
 * A workspace on disk at 1.2.3: a root declaring `packages/*`, a public
 * `@scope/one` under it, and a private `@scope/two`.
 */
export class WorkspaceHarness {
	readonly fs = new FakeFs();

	static async seeded(): Promise<WorkspaceHarness> {
		const harness = new WorkspaceHarness();
		await harness.write("/repo", {
			version: "1.2.3",
			workspaces: ["packages/*"],
		});
		await harness.write("/repo/packages/one", {
			name: "@scope/one",
			version: "1.2.3",
		});
		await harness.write("/repo/packages/two", {
			name: "@scope/two",
			version: "1.2.3",
			private: true,
		});
		return harness;
	}

	/** The workspace rooted at `/repo`, which is the one every test reads. */
	get workspace(): ManifestWorkspace {
		return new ManifestWorkspace("/repo", { fs: this.fs });
	}

	async write(dir: string, manifest: object): Promise<void> {
		await this.fs.mkdir(dir);
		await this.fs.write(`${dir}/package.json`, JSON.stringify(manifest));
	}

	async manifest(dir: string): Promise<Record<string, unknown>> {
		return JSON.parse(await this.fs.read(`${dir}/package.json`));
	}

	async versionAt(dir: string): Promise<unknown> {
		return (await this.manifest(dir)).version;
	}
}
