import type { Plan } from "../plan";
import type { Ship } from "./ship";

/** The plan a `FakeShip` answers with when it was given none. */
export function fakePlan(problems: Plan["problems"] = []): Plan {
	return {
		bump: "patch",
		current: "1.2.3",
		next: "1.2.4",
		resuming: false,
		packages: [],
		problems,
	};
}

/**
 * Answers with each plan it was built with in turn, so a re-plan can differ
 * from the first, and repeats the last one after that. `plans` counts how
 * many were asked for and `runs` holds the ones that were carried out.
 */
export class FakeShip implements Ship {
	plans = 0;
	readonly runs: Plan[] = [];

	private readonly answers: Plan[];

	constructor(...answers: Plan[]) {
		this.answers = answers;
	}

	async plan(): Promise<Plan> {
		return (
			this.answers[this.plans++] ??
			this.answers[this.answers.length - 1] ??
			fakePlan()
		);
	}

	async run(approved: Plan): Promise<void> {
		this.runs.push(approved);
	}
}
