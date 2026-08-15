import { MemoryLogger } from "@webappwiz/log";
import type { Package } from "../workspace/workspace";
import type { Release } from "./release";

const PACKAGES: Package[] = [
	{ name: "@scope/one", dir: "/repo/packages/one", private: false },
	{ name: "@scope/two", dir: "/repo/packages/two", private: false },
];

/**
 * A release of 1.2.4 holding two packages, unless a test says otherwise.
 * `tagged` counts how many steps asked for the tag.
 */
export class FakeRelease implements Release {
	readonly log = new MemoryLogger();
	tagged = 0;

	constructor(
		readonly version = "1.2.4",
		private readonly packages: Package[] = PACKAGES,
	) {}

	dir(name: string): string | undefined {
		return this.packages.find((pkg) => pkg.name === name)?.dir;
	}

	async tag(): Promise<string> {
		this.tagged++;
		return `v${this.version}`;
	}
}
