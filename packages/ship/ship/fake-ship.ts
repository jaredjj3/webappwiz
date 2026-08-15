import type { Release } from "../release/release";
import type { Ship } from "./ship";

/**
 * A step publishing the packages it was named for. `runs` holds every release
 * it was run in.
 */
export class FakeShip implements Ship {
	readonly runs: Release[] = [];

	constructor(readonly packages: readonly string[] = []) {}

	async run(release: Release): Promise<void> {
		this.runs.push(release);
	}
}
