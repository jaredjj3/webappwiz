import type { Release } from "../release/release";
import type { Ship } from "./ship";

/** Every step of a release, run in the order they were declared, at one version. */
export class LockstepShip implements Ship {
	private readonly steps: Ship[];

	constructor(...steps: Ship[]) {
		this.steps = steps;
	}

	get packages(): readonly string[] {
		return this.steps.flatMap((step) => [...step.packages]);
	}

	async run(release: Release): Promise<void> {
		for (const step of this.steps) {
			await step.run(release);
		}
	}
}
