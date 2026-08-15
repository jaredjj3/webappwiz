import type { Problem } from "../problem";
import type { Release } from "../release/release";
import type { Ship } from "./ship";

/**
 * A step publishing the packages it was named for and reporting the problems
 * it was handed. `runs` holds every release it was run in.
 */
export class FakeShip implements Ship {
	readonly runs: Release[] = [];

	constructor(
		readonly packages: readonly string[] = [],
		private readonly reported: Problem[] = [],
	) {}

	async problems(): Promise<Problem[]> {
		return this.reported;
	}

	async run(release: Release): Promise<void> {
		this.runs.push(release);
	}
}
