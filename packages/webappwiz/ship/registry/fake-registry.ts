import type { Registry } from "./registry";

/** A test registry whose published versions and publish calls are easy to set and read. */
export class FakeRegistry implements Registry {
	/** Entries read `name@version`. */
	readonly has = new Set<string>();
	readonly publishes: string[] = [];
	fails?: string;

	async published(name: string, version: string): Promise<boolean> {
		return this.has.has(`${name}@${version}`);
	}

	async available(): Promise<boolean> {
		return true;
	}

	async publish(dir: string): Promise<void> {
		if (dir === this.fails) {
			throw new Error(`publish failed in ${dir}`);
		}
		this.publishes.push(dir);
	}
}
