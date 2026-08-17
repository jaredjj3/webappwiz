import type { Registry } from "./registry";

/** Holding nothing, and recording every directory published. */
export class FakeRegistry implements Registry {
	/** Entries read `name@version`. */
	readonly has = new Set<string>();
	readonly publishes: string[] = [];

	async published(name: string, version: string): Promise<boolean> {
		return this.has.has(`${name}@${version}`);
	}

	async publish(dir: string): Promise<void> {
		this.publishes.push(dir);
	}
}
