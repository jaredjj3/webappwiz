import type { SecretStore } from "./secret-store";

/**
 * The operating system's own store, through `Bun.secrets`: the Keychain on
 * macOS, Credential Manager on Windows, and on Linux whatever secret service
 * daemon is running, such as GNOME Keyring or KWallet. Values are kept under
 * the service `webappwiz:<project>`, so each project's are its own, and
 * encrypted at rest by the system.
 */
export class SystemSecretStore implements SecretStore {
	/** The service its values are kept under. */
	readonly service: string;
	readonly label =
		process.platform === "darwin"
			? "the macOS Keychain"
			: process.platform === "win32"
				? "Windows Credential Manager"
				: "the system's secret service";

	constructor(
		/** Names whose values these are: a repository's name, usually. */
		readonly project: string,
	) {
		this.service = `webappwiz:${project}`;
	}

	async get(name: string): Promise<string | undefined> {
		return (
			(await Bun.secrets.get({ service: this.service, name })) ?? undefined
		);
	}

	async set(name: string, value: string): Promise<void> {
		await Bun.secrets.set({ service: this.service, name, value });
	}

	delete(name: string): Promise<boolean> {
		return Bun.secrets.delete({ service: this.service, name });
	}
}
