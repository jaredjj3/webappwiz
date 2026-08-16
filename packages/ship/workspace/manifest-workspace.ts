import { dirname } from "node:path";
import { type Fs, NodeFs } from "@webappwiz/system";
import type { Package, Workspace } from "./workspace";

interface Manifest {
	name?: string;
	version?: string;
	private?: boolean;
	workspaces?: string[];
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
}

/**
 * The package.json files a release reads and stamps. One version covers the
 * whole workspace, and the root manifest is where it lives.
 */
/** What a `ManifestWorkspace` reads through; the real filesystem by default. */
export interface ManifestWorkspaceOptions {
	fs?: Fs;
}

export class ManifestWorkspace implements Workspace {
	private readonly fs: Fs;

	constructor(
		/** The directory whose package.json declares the workspaces. */
		readonly root: string,
		opts: ManifestWorkspaceOptions = {},
	) {
		this.fs = opts.fs ?? new NodeFs();
	}

	/**
	 * Finds the workspace `from` sits in, climbing until a manifest claims one.
	 * A repo holding a single package declares no workspaces, so when nothing
	 * above claims any, the nearest named manifest is a workspace of one.
	 */
	static async at(
		from: string,
		opts: ManifestWorkspaceOptions = {},
	): Promise<ManifestWorkspace> {
		const fs = opts.fs ?? new NodeFs();
		let single: string | null = null;
		for (let dir = from; ; dir = dirname(dir)) {
			const manifest = await read(fs, dir);
			if (manifest?.workspaces !== undefined) {
				return new ManifestWorkspace(dir, { fs });
			}
			if (single === null && manifest?.name !== undefined) {
				single = dir;
			}
			if (dirname(dir) === dir) {
				if (single === null) {
					throw new Error(`no workspace above ${from}`);
				}
				return new ManifestWorkspace(single, { fs });
			}
		}
	}

	/** The version every package in the workspace shares. */
	async version(): Promise<string> {
		return (await this.manifest()).version ?? "0.0.0";
	}

	async packages(): Promise<Package[]> {
		const found: Array<{ dir: string; manifest: Manifest & { name: string } }> =
			[];
		for (const dir of await this.dirs()) {
			const manifest = await read(this.fs, dir);
			if (manifest?.name !== undefined) {
				found.push({ dir, manifest: { ...manifest, name: manifest.name } });
			}
		}
		// Which names are siblings is only knowable once every manifest is read,
		// so the dependency lists are narrowed to the workspace in a second pass.
		const names = new Set(found.map((one) => one.manifest.name));
		return found
			.map(({ dir, manifest }) => ({
				name: manifest.name,
				dir,
				private: manifest.private === true,
				// Peers count and devDependencies do not: a consumer installing this
				// package gets its peers resolved and never sees what tested it.
				dependencies: Object.keys({
					...manifest.dependencies,
					...manifest.peerDependencies,
				}).filter((dep) => names.has(dep)),
			}))
			.sort((left, right) => left.name.localeCompare(right.name));
	}

	/**
	 * Stamps `version` into every package and the root manifest, in lockstep.
	 * The root goes last, because it is the version a release reads: stamping it
	 * first would leave a run that died partway reading as the version it never
	 * finished, and send the next one past it.
	 */
	async setVersion(version: string): Promise<void> {
		for (const dir of new Set([...(await this.dirs()), this.root])) {
			await this.stamp(dir, version);
		}
	}

	private async dirs(): Promise<string[]> {
		const { workspaces } = await this.manifest();
		if (workspaces === undefined) {
			return [this.root]; // no workspaces declared: the root is the one package
		}
		const dirs: string[] = [];
		for (const pattern of workspaces) {
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
