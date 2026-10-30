import type { Publication, Registry, StagedPackage } from "./registry";

/** A test registry whose published versions and publish calls are easy to set and read. */
export class FakeRegistry implements Registry {
	/** Entries read `name@version`. */
	readonly has = new Set<string>();
	readonly publishes: string[] = [];
	/** Directories whose publish the registry took already, answering a retry with `already`. */
	readonly accepted = new Set<string>();
	/** Name to the version installs get, as `latest` reads on npm. */
	readonly latest = new Map<string, string>();
	fails?: string;
	/** Makes `publish` stage, reporting this for each directory. */
	staging?: (dir: string) => StagedPackage;
	/** Makes the registry scan what it accepts, as npm does. */
	scanning?: boolean;

	/** Set once `trusted()` is asked for: publishes then go out unstaged, as CI's do. */
	viaTrust = false;

	get staged(): boolean {
		return this.staging !== undefined && !this.viaTrust;
	}

	trusted(): Registry {
		this.viaTrust = true;
		return this;
	}

	get scans(): boolean {
		return this.scanning === true;
	}

	async published(name: string, version: string): Promise<boolean> {
		return this.has.has(`${name}@${version}`);
	}

	async deployed(name: string): Promise<string | undefined> {
		return this.latest.get(name);
	}

	async publish(dir: string): Promise<Publication> {
		if (dir === this.fails) {
			throw new Error(`publish failed in ${dir}`);
		}
		if (this.accepted.has(dir)) {
			return { already: true };
		}
		this.publishes.push(dir);
		const staged = this.viaTrust ? undefined : this.staging?.(dir);
		return staged === undefined ? {} : { staged };
	}

	page(name: string, version: string): string {
		return `https://registry/${name}/v/${version}`;
	}
}
