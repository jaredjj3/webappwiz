import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import type { Registry } from "./registry";

/** The filesystem and processes `NpmRegistry` uses; real ones by default. */
export interface NpmRegistryOptions {
	fs?: Fs;
	ps?: Ps;
}

/** Publishes packages to npm and checks exact versions with `bun install`. */
export class NpmRegistry implements Registry {
	private readonly fs: Fs;
	private readonly ps: Ps;
	private authed?: Promise<void>;

	constructor(opts: NpmRegistryOptions = {}) {
		this.fs = opts.fs ?? new NodeFs();
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

	async deployed(name: string): Promise<string | undefined> {
		const { exitCode, stdout, stderr } = await this.ps.spawnCapture([
			"npm",
			"view",
			name,
			"dist-tags.latest",
		]);
		if (exitCode === 0) {
			return stdout.trim() || undefined;
		}
		// A name nobody has published is a 404, which is an answer: nothing yet.
		if (stderr.includes("E404")) {
			return undefined;
		}
		throw new Error(`npm view ${name}: ${stderr.trim() || stdout.trim()}`);
	}

	async available(name: string, version: string): Promise<boolean> {
		const dir = join(tmpdir(), `webappwiz-ship-${crypto.randomUUID()}`);
		await this.fs.mkdir(dir);
		try {
			await this.fs.write(
				join(dir, "package.json"),
				`${JSON.stringify({ private: true, dependencies: { [name]: version } })}\n`,
			);
			const { exitCode } = await this.ps.spawnCapture(["bun", "install"], {
				cwd: dir,
			});
			return exitCode === 0;
		} finally {
			await this.fs.rm(dir, { recursive: true, force: true });
		}
	}

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
		// `npm login` reads from a human, though the web flow only prints a link. CI is where there is none, and where it
		// would sit waiting rather than failing, so say what to set instead.
		if (this.ps.env("CI") !== undefined) {
			throw new Error("not logged in to npm: set NPM_TOKEN");
		}
		const { exitCode } = await this.ps.spawn([
			"npm",
			"login",
			"--auth-type=web",
		]);
		if (exitCode !== 0) {
			throw new Error("npm login failed");
		}
	}
}
