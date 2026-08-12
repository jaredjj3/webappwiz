import type { Package } from "../plan";
import type { Workspace } from "./workspace";

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

/**
 * Two public packages and one private one at 1.2.3, unless a test stamps a
 * version over it. `stamped` records every version it was given, in order.
 */
export class FakeWorkspace implements Workspace {
	readonly root = "/repo";
	readonly stamped: string[] = [];

	constructor(private readonly contents: Package[] = PACKAGES) {}

	async version(): Promise<string> {
		return this.stamped.at(-1) ?? "1.2.3";
	}

	async packages(): Promise<Package[]> {
		return this.contents;
	}

	async setVersion(version: string): Promise<void> {
		this.stamped.push(version);
	}
}
