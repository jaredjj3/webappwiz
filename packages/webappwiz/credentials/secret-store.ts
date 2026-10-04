/**
 * Where one project's credentials are kept, by name, so code that needs one
 * does not decide where it lives. `SystemSecretStore` is the operating
 * system's; `FakeSecretStore` is a map for tests.
 */
export interface SecretStore {
	/** What a person calls it, as in "saved to the macOS Keychain". */
	readonly label: string;
	/** The value kept under `name`, or undefined when there is none. */
	get(name: string): Promise<string | undefined>;
	/** Keeps `value` under `name`, over whatever was there. */
	set(name: string, value: string): Promise<void>;
	/** Whether there was a value under `name` to delete. */
	delete(name: string): Promise<boolean>;
}
