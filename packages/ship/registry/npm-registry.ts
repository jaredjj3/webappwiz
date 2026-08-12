import type { Ps } from "@webappwiz/sys";
import type { Registry } from "./registry";

/** The npm registry, reached through the npm and bun CLIs. */
export class NpmRegistry implements Registry {
	constructor(private readonly ps: Ps) {}

	/** Whether npm has credentials. NPM_TOKEN counts, so a server needs no login. */
	async authed(): Promise<boolean> {
		const { exitCode } = await this.ps.spawnCapture(["npm", "whoami"]);
		return exitCode === 0;
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
