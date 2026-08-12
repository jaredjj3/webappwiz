import { MemoryLogger } from "@webappwiz/log";
import type { Package } from "./plan";
import { Ship } from "./ship";

const PACKAGES: Package[] = [
	{
		name: "@scope/one",
		dir: "/repo/packages/one",
		private: false,
		published: false,
	},
	{
		name: "@scope/two",
		dir: "/repo/packages/two",
		private: false,
		published: false,
	},
	{
		name: "@scope/hid",
		dir: "/repo/packages/hid",
		private: true,
		published: false,
	},
];

function fakeWorkspace() {
	return {
		stamped: [] as string[],
		async version(): Promise<string> {
			return this.stamped.at(-1) ?? "1.2.3";
		},
		async packages(): Promise<Package[]> {
			return PACKAGES;
		},
		async setVersion(version: string): Promise<void> {
			this.stamped.push(version);
		},
	};
}

function fakeGit() {
	return {
		dirty: false,
		current: "main",
		trunk: "main",
		subject: "Teach show to check the TODO",
		tags: new Set<string>(),
		commits: [] as string[],
		pushes: [] as string[],
		async clean(): Promise<boolean> {
			return !this.dirty;
		},
		async branch(): Promise<string> {
			return this.current;
		},
		async defaultBranch(): Promise<string> {
			return this.trunk;
		},
		async headSubject(): Promise<string> {
			return this.subject;
		},
		async hasTag(tag: string): Promise<boolean> {
			return this.tags.has(tag);
		},
		async commitAll(message: string): Promise<void> {
			this.commits.push(message);
		},
		async tag(tag: string): Promise<void> {
			this.tags.add(tag);
		},
		async push(ref: string): Promise<void> {
			this.pushes.push(ref);
		},
	};
}

function fakeRegistry() {
	return {
		loggedIn: true,
		/** Entries read `name@version`. */
		has: new Set<string>(),
		publishes: [] as string[],
		async authed(): Promise<boolean> {
			return this.loggedIn;
		},
		async published(name: string, version: string): Promise<boolean> {
			return this.has.has(`${name}@${version}`);
		},
		async publish(dir: string): Promise<void> {
			this.publishes.push(dir);
		},
	};
}

function fakeGithub() {
	return {
		loggedIn: true,
		releases: [] as string[],
		async authed(): Promise<boolean> {
			return this.loggedIn;
		},
		async release(tag: string): Promise<void> {
			this.releases.push(tag);
		},
	};
}

/**
 * A `Ship` wired to fakes for every collaborator, each left on the field it
 * sits on so a test can move one and read what came of it. The workspace
 * starts at 1.2.3 with two public packages and one private one, and every
 * login succeeds.
 */
export class ShipHarness {
	readonly workspace = fakeWorkspace();
	readonly git = fakeGit();
	readonly registry = fakeRegistry();
	readonly github = fakeGithub();
	readonly ship = new Ship(
		new MemoryLogger(),
		this.workspace,
		this.git,
		this.registry,
		this.github,
	);
}
