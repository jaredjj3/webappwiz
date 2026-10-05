/**
 * Somewhere a credential's value can come from, by its environment variable
 * name. `Credentials` reads a list of them in order, and the caller picks
 * which: the environment and a `.env` file where the app is deployed, the
 * system's store on a person's machine.
 */
export interface CredentialSource {
	/** What a person calls it, as in "the environment" or "the macOS Keychain". */
	readonly label: string;
	/** The value it has for `name`, or undefined when it has none. */
	get(name: string): Promise<string | undefined>;
}
