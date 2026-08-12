import { dirname } from "node:path";
import type { Fs } from "@webappwiz/sys";
import type { Package } from "./plan";

interface Manifest {
	name?: string;
	version?: string;
	private?: boolean;
	workspaces?: string[];
}

/**
 * The package.json files a release reads and stamps. One version covers the
 * whole workspace, and the root manifest is where it lives.
 */
export class Workspace {
	constructor(
		private readonly fs: Fs,
		/** The directory whose package.json declares the workspaces. */
		readonly root: string,
	) {}

	/** Finds the workspace `from` sits in, climbing until a manifest claims one. */
	static async at(fs: Fs, from: string): Promise<Workspace> {
		for (let dir = from; ; dir = dirname(dir)) {
			const manifest = await read(fs, dir);
			if (manifest?.workspaces !== undefined) {
				return new Workspace(fs, dir);
			}
			if (dirname(dir) === dir) {
				throw new Error(`no workspace above ${from}`);
			}
		}
	}

	/** The version every package in the workspace shares. */
	async version(): Promise<string> {
		return (await this.manifest()).version ?? "0.0.0";
	}

	async packages(): Promise<Package[]> {
		const packages: Package[] = [];
		for (const dir of await this.dirs()) {
			const manifest = await read(this.fs, dir);
			if (manifest?.name === undefined) {
				continue;
			}
			packages.push({
				name: manifest.name,
				dir,
				private: manifest.private === true,
				published: false,
			});
		}
		return packages.sort((left, right) => left.name.localeCompare(right.name));
	}

	/** Stamps `version` into the root manifest and every package, in lockstep. */
	async setVersion(version: string): Promise<void> {
		for (const dir of [this.root, ...(await this.dirs())]) {
			await this.stamp(dir, version);
		}
	}

	private async dirs(): Promise<string[]> {
		const dirs: string[] = [];
		for (const pattern of (await this.manifest()).workspaces ?? []) {
			// ponytail: only `dir/*` and plain paths, which is all any repo here
			// writes. Reach for a glob library when one of them needs `**`.
			if (!pattern.endsWith("/*")) {
				dirs.push(`${this.root}/${pattern}`);
				continue;
			}
			const parent = `${this.root}/${pattern.slice(0, -2)}`;
			for (const entry of await this.fs.readdir(parent).catch(() => [])) {
				dirs.push(`${parent}/${entry}`);
			}
		}
		return dirs;
	}

	private async manifest(): Promise<Manifest> {
		return (await read(this.fs, this.root)) ?? {};
	}

	private async stamp(dir: string, version: string): Promise<void> {
		const path = `${dir}/package.json`;
		const manifest = await read(this.fs, dir);
		if (manifest === null) {
			return;
		}
		manifest.version = version;
		await this.fs.write(path, `${JSON.stringify(manifest, null, "\t")}\n`);
	}
}

/** Null covers both "no manifest here" and "one no parser would take". */
async function read(fs: Fs, dir: string): Promise<Manifest | null> {
	try {
		return JSON.parse(await fs.read(`${dir}/package.json`));
	} catch {
		return null;
	}
}
