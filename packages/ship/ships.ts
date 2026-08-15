import { type Fs, NodePs, type Ps } from "@webappwiz/system";
import { CliGithub, type CliGithubOptions } from "./github/cli-github";
import { NpmRegistry, type NpmRegistryOptions } from "./registry/npm-registry";
import type { Registry } from "./registry/registry";
import { GithubShip } from "./ship/github-ship";
import { LockstepShip } from "./ship/lockstep-ship";
import { RegistryShip } from "./ship/registry-ship";
import type { Ship } from "./ship/ship";
import { ManifestWorkspace } from "./workspace/manifest-workspace";

/** What `ships.workspace` reads the roster through; the real system by default. */
export interface WorkspaceShipOptions {
	fs?: Fs;
	ps?: Ps;
}

/**
 * Declares what a repository ships: name each package and where it goes, then
 * compose the declarations with `lockstep`.
 *
 * ```ts
 * const release = ships.lockstep(
 * 	ships.npm("@scope/foo"),
 * 	ships.custom("@scope/baz", new S3Registry()),
 * 	ships.github(),
 * );
 * ```
 */
export class ships {
	private constructor() {}

	/** A package the npm registry carries. */
	static npm(name: string, opts: NpmRegistryOptions = {}): Ship {
		return new RegistryShip(name, new NpmRegistry(opts));
	}

	/** A package `registry` carries, for wherever npm is not the answer. */
	static custom(name: string, registry: Registry): Ship {
		return new RegistryShip(name, registry);
	}

	/** The release notes GitHub publishes for the tag. */
	static github(opts: CliGithubOptions = {}): Ship {
		return new GithubShip(new CliGithub(opts));
	}

	/** Every step above, run in the order they are given, at one version. */
	static lockstep(...steps: Ship[]): Ship {
		return new LockstepShip(...steps);
	}

	/**
	 * The workspace's own release: every public package around the working
	 * directory onto npm, with GitHub release notes. This is what `wiz ship`
	 * runs when nothing declares otherwise.
	 */
	static async workspace(opts: WorkspaceShipOptions = {}): Promise<Ship> {
		const ps = opts.ps ?? new NodePs();
		const workspace = await ManifestWorkspace.at(ps.cwd(), { fs: opts.fs });
		const registry = new NpmRegistry({ ps });
		const steps = (await workspace.packages())
			.filter((pkg) => !pkg.private)
			.map((pkg) => new RegistryShip(pkg.name, registry));
		return new LockstepShip(...steps, new GithubShip(new CliGithub({ ps })));
	}
}
