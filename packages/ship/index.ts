// judge-ignore-file one-dir-per-interface: this is the package entry point named in
// package.json exports, not a barrel sitting inside an interface's directory
export { CliGit, type CliGitOptions } from "./git/cli-git";
export { FakeGit } from "./git/fake-git";
export type { Git } from "./git/git";
export { CliGithub, type CliGithubOptions } from "./github/cli-github";
export { FakeGithub } from "./github/fake-github";
export type { Github } from "./github/github";
export type { Package, Plan, Problem, ProblemKind } from "./plan";
export { FakeRegistry } from "./registry/fake-registry";
export {
	NpmRegistry,
	type NpmRegistryOptions,
} from "./registry/npm-registry";
export type { Registry } from "./registry/registry";
export { FakeShip, fakePlan } from "./ship/fake-ship";
export {
	LockstepShip,
	type LockstepShipOptions,
} from "./ship/lockstep-ship";
export type { Ship } from "./ship/ship";
export { BUMPS, type Bump, bump, isBump } from "./version";
export { FakeWorkspace } from "./workspace/fake-workspace";
export {
	ManifestWorkspace,
	type ManifestWorkspaceOptions,
} from "./workspace/manifest-workspace";
export type { Workspace } from "./workspace/workspace";
