import type { Problem } from "../plan";
import type { Registry } from "./registry";

/** The problem a `FakeRegistry` reports when `loggedIn` is off. */
export const REGISTRY_AUTH: Problem = {
	kind: "registry-auth",
	message: "not logged in to the registry",
	remedy: ["registry", "login"],
};

/** Logged in, holding nothing, and recording every directory published. */
export class FakeRegistry implements Registry {
	loggedIn = true;
	/** Entries read `name@version`. */
	readonly has = new Set<string>();
	readonly publishes: string[] = [];

	async problems(): Promise<Problem[]> {
		return this.loggedIn ? [] : [REGISTRY_AUTH];
	}

	async published(name: string, version: string): Promise<boolean> {
		return this.has.has(`${name}@${version}`);
	}

	async publish(dir: string): Promise<void> {
		this.publishes.push(dir);
	}
}
