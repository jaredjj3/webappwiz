import type { Problem } from "../problem";
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

	/** Everything the steps report, each problem said once. */
	async problems(): Promise<Problem[]> {
		const problems: Problem[] = [];
		const seen = new Set<string>();
		for (const step of this.steps) {
			for (const problem of await step.problems()) {
				const key = `${problem.kind}: ${problem.message}`;
				if (!seen.has(key)) {
					seen.add(key);
					problems.push(problem);
				}
			}
		}
		return problems;
	}

	async run(release: Release): Promise<void> {
		for (const step of this.steps) {
			await step.run(release);
		}
	}
}
