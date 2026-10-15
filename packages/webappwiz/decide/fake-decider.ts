import { Duration } from "webappwiz/time";
import type { Answer, Decider, Decision, Question } from "./decider";

/** One call a test made. */
export interface Asked {
	state: unknown;
	questions: Record<string, Question>;
}

/** Answers from what a test set, and remembers what it was asked. */
export class FakeDecider implements Decider {
	/** What it answers each question id with. */
	answers: Record<string, Answer> = {};
	/** Set to make a decision fail with it. */
	failure: Error | undefined;
	readonly asked: Asked[] = [];

	async decide(
		state: unknown,
		questions: Record<string, Question>,
	): Promise<Decision> {
		this.asked.push({ state, questions });
		if (this.failure !== undefined) {
			throw this.failure;
		}
		const answers: Record<string, Answer> = {};
		for (const id of Object.keys(questions)) {
			const answer = this.answers[id];
			if (answer === undefined) {
				throw new Error(`FakeDecider has no answer for "${id}"`);
			}
			answers[id] = answer;
		}
		return {
			model: "fake",
			answers,
			cost: {
				latency: Duration.zero(),
				inputTokens: 0,
				outputTokens: 0,
				dollars: 0,
			},
		};
	}
}
