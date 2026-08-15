import { MemoryLogger } from "@webappwiz/log";
import { FakeGit } from "../git/fake-git";
import { FakeGithub } from "../github/fake-github";
import { FakeRegistry } from "../registry/fake-registry";
import { FakeWorkspace } from "../workspace/fake-workspace";
import { LockstepShip } from "./lockstep-ship";

/**
 * A `LockstepShip` wired to a fake for every collaborator, each left on the
 * field it sits on so a test can move one and read what came of it. The
 * workspace starts at 1.2.3 with two public packages and one private one,
 * both public packages are declared onto the one registry, the tree is clean
 * on the default branch, and every login succeeds.
 */
export class ShipHarness {
	readonly workspace = new FakeWorkspace();
	readonly git = new FakeGit();
	readonly registry = new FakeRegistry();
	readonly github = new FakeGithub();
	readonly ship = new LockstepShip(
		[
			{ name: "@scope/one", registry: this.registry },
			{ name: "@scope/two", registry: this.registry },
		],
		{
			workspace: this.workspace,
			git: this.git,
			github: this.github,
			log: new MemoryLogger(),
		},
	);
}
