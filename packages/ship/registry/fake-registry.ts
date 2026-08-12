import type { Registry } from "./registry";

/** Logged in, holding nothing, and recording every directory published. */
export class FakeRegistry implements Registry {
	loggedIn = true;
	/** Entries read `name@version`. */
	readonly has = new Set<string>();
	readonly publishes: string[] = [];

	async authed(): Promise<boolean> {
		return this.loggedIn;
	}

	async published(name: string, version: string): Promise<boolean> {
		return this.has.has(`${name}@${version}`);
	}

	async publish(dir: string): Promise<void> {
		this.publishes.push(dir);
	}
}
