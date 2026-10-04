import { basename, dirname } from "node:path";
import {
	Credentials,
	type SecretStore,
	SystemSecretStore,
} from "webappwiz/credentials";
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
	/** Where values are kept; the system's store under the project's name by default. */
	store?: SecretStore;
}

/**
 * The credentials of the project around a directory: which it uses, named
 * in its config and by wiz itself, and where their values come from.
 */
export class ProjectCredentials {
	private constructor(
		/** What the store keeps them under, as `webappwiz:<project>`. */
		readonly project: string,
		/** Every credential the project uses, by name, with what it is for. */
		readonly names: ReadonlyMap<string, string>,
		/** Where values a person adds are saved. */
		readonly store: SecretStore,
		readonly credentials: Credentials,
	) {}

	/**
	 * The project around `dir`. Its name is `credentials.project` from the
	 * config, or else the directory of the repository's main worktree, so a
	 * value added from one worktree is there in every other.
	 */
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
			"--path-format=absolute",
			"--show-toplevel",
			"--git-common-dir",
		]);
		const [root, common] = exitCode === 0 ? stdout.trim().split("\n") : [];
		const config = await loadCredentialsConfig(root ?? dir, { fs, ps });
		const project =
			config.project ?? basename(common === undefined ? dir : dirname(common));
		const store = opts.store ?? new SystemSecretStore(project);
		return new ProjectCredentials(
			project,
			new Map(
				Object.entries({ ...WIZ_CREDENTIALS, ...config.names }).toSorted(
					([left], [right]) => left.localeCompare(right),
				),
			),
			store,
			new Credentials(store, { ps }),
		);
	}

	/** The credentials the project uses that neither the environment nor the store has. */
	async missing(): Promise<string[]> {
		const missing: string[] = [];
		for (const name of this.names.keys()) {
			if ((await this.credentials.source(name)) === "missing") {
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
}
