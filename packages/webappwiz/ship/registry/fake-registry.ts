import type { Registry, StagedPackage } from "./registry";

/** A test registry whose published versions and publish calls are easy to set and read. */
export class FakeRegistry implements Registry {
	/** Entries read `name@version`. */
	readonly has = new Set<string>();
	readonly publishes: string[] = [];
	/** Name to the version installs get, as `latest` reads on npm. */
	readonly latest = new Map<string, string>();
	fails?: string;
	/** Makes `publish` stage, reporting this for each directory. */
	staging?: (dir: string) => StagedPackage;

	get staged(): boolean {
		return this.staging !== undefined;
	}

	async published(name: string, version: string): Promise<boolean> {
		return this.has.has(`${name}@${version}`);
	}

	async deployed(name: string): Promise<string | undefined> {
		return this.latest.get(name);
	}

	async publish(dir: string): Promise<StagedPackage | undefined> {
		if (dir === this.fails) {
			throw new Error(`publish failed in ${dir}`);
		}
		this.publishes.push(dir);
		return this.staging?.(dir);
	}
}
