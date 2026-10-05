import {
	Credentials,
	Environment,
	type SecretStore,
	SystemSecretStore,
} from "webappwiz/creds";
import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import { loadCredentialsConfig } from "../load-config";

/** The credentials wiz itself uses, by name, with what each is for. */
export const WIZ_CREDENTIALS: Record<string, string> = {
	CLOUDFLARE_ACCOUNT_ID: "Workers AI, for scry's clef and clef-flash",
	CLOUDFLARE_API_TOKEN: "Workers AI, for scry's clef and clef-flash",
	TYPESAFE_API_KEY: "TypeSafe, for scry's jev models",
};

/** What `ProjectCredentials.open` reads through; the real ones by default. */
export interface ProjectCredentialsOptions {
	fs?: Fs;
	ps?: Ps;
	/** The project's store; the system's, under the project's name, by default. */
	store?: SecretStore;
	/** The device's store, shared by every project; the system's by default. */
	deviceStore?: SecretStore;
}

/**
 * The credentials of the project around a directory: which it uses, named
 * in its config and by wiz itself, and the two stores a person keeps them
 * in. wiz reads the environment first, then the project's store, then the
 * device's, so CI hands scry its keys the way it always has.
 */
export class ProjectCredentials {
	private constructor(
		/** Every credential the project uses, by name, with what it is for. */
		readonly names: ReadonlyMap<string, string>,
		/** Where values for this project alone are kept. */
		readonly store: SecretStore,
		/** Where values for every project on this device are kept. */
		readonly device: SecretStore,
		readonly credentials: Credentials,
	) {}

	/** The project around `dir`. */
	static async open(
		dir: string,
		opts: ProjectCredentialsOptions = {},
	): Promise<ProjectCredentials> {
		const fs = opts.fs ?? new NodeFs();
		const ps = opts.ps ?? new NodePs();
		const { stdout, exitCode } = await ps.spawnCapture([
			"git",
			"-C",
			dir,
			"rev-parse",
			"--show-toplevel",
		]);
		const root = (exitCode === 0 && stdout.trim().split("\n")[0]) || dir;
		const config = await loadCredentialsConfig(root, { fs, ps });
		const store =
			opts.store ?? (await SystemSecretStore.forProject(dir, { fs, ps }));
		const device = opts.deviceStore ?? SystemSecretStore.device();
		return new ProjectCredentials(
			new Map(
				Object.entries({ ...WIZ_CREDENTIALS, ...config.names }).toSorted(
					([left], [right]) => left.localeCompare(right),
				),
			),
			store,
			device,
			new Credentials([new Environment({ ps }), store, device]),
		);
	}

	/** The credentials the project uses that no source has. */
	async missing(): Promise<string[]> {
		const missing: string[] = [];
		for (const name of this.names.keys()) {
			if ((await this.credentials.source(name)) === undefined) {
				missing.push(name);
			}
		}
		return missing;
	}

	/** Throws, naming what is known, unless the project uses `name`. */
	known(name: string): void {
		if (!this.names.has(name)) {
			throw new Error(
				`${name} is not a credential this project uses: name it in .wiz/config.ts under credentials.names, beside ${[...this.names.keys()].join(", ")}`,
			);
		}
	}

	/** The project's store, or the device's when `device` is set. */
	keptIn(device: boolean): SecretStore {
		return device ? this.device : this.store;
	}
}
