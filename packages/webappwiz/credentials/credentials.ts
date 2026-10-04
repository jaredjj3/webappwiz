import { NodePs, type Ps } from "webappwiz/system";
import type { SecretStore } from "./secret-store";

/** Where a credential's value comes from, when it comes from anywhere. */
export type CredentialSource = "environment" | "store" | "missing";

/** Where `Credentials` reads the environment; the real process by default. */
export interface CredentialsOptions {
	ps?: Ps;
}

/**
 * A project's credentials, each named the way its environment variable is:
 * the environment first, so CI and a one-off override work as they always
 * have, then the store. There is no way to list what the store holds; a
 * caller names what it needs.
 */
export class Credentials {
	private ps: Ps;

	constructor(
		private readonly store: SecretStore,
		opts: CredentialsOptions = {},
	) {
		this.ps = opts.ps ?? new NodePs();
	}

	/** The value of `name`, or undefined when neither has it. */
	async get(name: string): Promise<string | undefined> {
		const set = this.ps.env(name);
		return set !== undefined && set !== "" ? set : this.store.get(name);
	}

	/**
	 * The value of `name`, or an error saying how a person sets it. The error
	 * never holds a value, so it is safe to show anyone.
	 */
	async require(name: string): Promise<string> {
		const value = await this.get(name);
		if (value === undefined || value === "") {
			throw new Error(
				`${name} is not set: ask a person to run \`bunx @webappwiz/cli creds add ${name}\`, or set it in the environment`,
			);
		}
		return value;
	}

	/** Where `name` would be read from, without reading it out. */
	async source(name: string): Promise<CredentialSource> {
		const set = this.ps.env(name);
		if (set !== undefined && set !== "") {
			return "environment";
		}
		return (await this.store.get(name)) === undefined ? "missing" : "store";
	}

	/** Keeps `value` under `name` in the store. The environment still wins. */
	add(name: string, value: string): Promise<void> {
		return this.store.set(name, value);
	}

	/** Whether the store had `name` to remove. The environment is untouched. */
	remove(name: string): Promise<boolean> {
		return this.store.delete(name);
	}
}
