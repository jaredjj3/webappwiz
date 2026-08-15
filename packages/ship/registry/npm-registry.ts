import { NodePs, type Ps } from "@webappwiz/system";
import type { Problem } from "../plan";
import type { Registry } from "./registry";

/** The npm registry, reached through the npm and bun CLIs. */
/** What a `NpmRegistry` spawns through; the real process by default. */
export interface NpmRegistryOptions {
	ps?: Ps;
}

export class NpmRegistry implements Registry {
	private readonly ps: Ps;

	constructor(opts: NpmRegistryOptions = {}) {
		this.ps = opts.ps ?? new NodePs();
	}

	/** Missing npm credentials, if any. NPM_TOKEN counts, so a server needs no login. */
	async problems(): Promise<Problem[]> {
		const { exitCode } = await this.ps.spawnCapture(["npm", "whoami"]);
		if (exitCode === 0) {
			return [];
		}
		return [
			{
				kind: "npm-auth",
				message: "not logged in to npm",
				remedy: ["npm", "login"],
			},
		];
	}

	async published(name: string, version: string): Promise<boolean> {
		const { exitCode, stdout } = await this.ps.spawnCapture([
			"npm",
			"view",
			`${name}@${version}`,
			"version",
		]);
		// A name nobody has published fails outright, but a known name missing
		// this one version succeeds and says nothing, so the output decides.
		return exitCode === 0 && stdout.trim() !== "";
	}

	/**
	 * Publishes the package in `dir`. bun rewrites its `workspace:*` dependencies
	 * to the version going out, which is what keeps a lockstep release coherent.
	 */
	async publish(dir: string): Promise<void> {
		// Inherits stdio: publishing is the slow step, and watching it beats
		// holding its output back until it fails.
		const { exitCode } = await this.ps.spawn(
			["bun", "publish", "--access", "public"],
			{ cwd: dir },
		);
		if (exitCode !== 0) {
			throw new Error(`publish failed in ${dir}`);
		}
	}
}
