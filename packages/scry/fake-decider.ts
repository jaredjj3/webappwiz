import type { Decider } from "./decider";
import type { Span } from "./span";

/** A decider for tests: answers by what the span it is asked about contains, and records what it was asked. */
export class FakeDecider implements Decider {
	readonly asked: { question: string; about: Span }[] = [];

	constructor(
		/** The probability to answer when the span's text contains the key. */
		private answers: Record<string, number> = {},
		private otherwise = 0,
	) {}

	async decide(question: string, about: Span): Promise<number> {
		this.asked.push({ question, about });
		const match = Object.entries(this.answers).find(([key]) =>
			about.text.includes(key),
		);
		return match?.[1] ?? this.otherwise;
	}
}
