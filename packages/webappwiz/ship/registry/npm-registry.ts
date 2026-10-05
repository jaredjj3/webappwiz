import { NodePs, type Ps } from "webappwiz/system";
import type { Registry } from "./registry";

/** The npm registry, reached through the npm CLI. */
/** What a `NpmRegistry` spawns through; the real process by default. */
export interface NpmRegistryOptions {
	ps?: Ps;
}

export class NpmRegistry implements Registry {
	private readonly ps: Ps;
	private authed?: Promise<void>;

	constructor(opts: NpmRegistryOptions = {}) {
		this.ps = opts.ps ?? new NodePs();
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
	 * Publishes the package in `dir`, asking for a login first if npm has
	 * nobody. npm rather than bun sends it: npm's web 2FA can remember a
	 * publish for five minutes, but only from the same IP, and on a dual-stack
	 * network each bun process picks IPv4 or IPv6 afresh, so a release of
	 * several packages asked again whenever the address changed.
	 */
	async publish(dir: string): Promise<void> {
		this.authed ??= this.login();
		await this.authed;
		// Inherits stdio: publishing is the slow step, and watching it beats
		// holding its output back until it fails.
		const { exitCode } = await this.ps.spawn(
			["npm", "publish", "--access", "public"],
			{ cwd: dir },
		);
		if (exitCode !== 0) {
			throw new Error(`publish failed in ${dir}`);
		}
	}

	/** Runs `npm login` unless somebody is already logged in. NPM_TOKEN counts. */
	private async login(): Promise<void> {
		if ((await this.ps.spawnCapture(["npm", "whoami"])).exitCode === 0) {
			return;
		}
		// `npm login` reads from a human. CI is where there is none, and where it
		// would sit waiting rather than failing, so say what to set instead.
		if (this.ps.env("CI") !== undefined) {
			throw new Error("not logged in to npm: set NPM_TOKEN");
		}
		const { exitCode } = await this.ps.spawn(["npm", "login"]);
		if (exitCode !== 0) {
			throw new Error("npm login failed");
		}
	}
}
