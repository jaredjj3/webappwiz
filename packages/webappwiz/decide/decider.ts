import type { Duration } from "webappwiz/time";

/** Answers typed questions about a state. */
export interface Decider {
	/** Clef refuses a question id outside `[A-Za-z0-9_.-]`, so ids keep to those. */
	decide(
		state: unknown,
		questions: Record<string, Question>,
		signal?: AbortSignal,
	): Promise<Decision>;
}

/** A yes/no question, answered as the probability of yes. */
export interface NoulQuestion {
	type: "noul";
	instructions: unknown;
	criteria?: { true?: unknown; false?: unknown };
}

/** Picks one option from `criteria`, each described by its value. */
export interface ChoiceQuestion {
	type: "choice";
	instructions: unknown;
	criteria: Record<string, unknown>;
}

/** Rates along an ordered rubric of two to ten levels. */
export interface ScoreQuestion {
	type: "score";
	instructions: unknown;
	criteria: unknown[];
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export type Answer =
	| { type: "noul"; noul: number }
	| {
			type: "choice";
			choice: string;
			probabilities: Record<string, number>;
			confidence: number;
	  }
	| {
			type: "score";
			score: number;
			legend: Record<string, string>;
			probabilities: Record<string, number>;
			confidence: number;
	  };

/** What it cost to answer, summed over every request a decision took. */
export interface Cost {
	/** Wall time from the first request sent to the last answer back. */
	latency: Duration;
	inputTokens: number;
	outputTokens: number;
	/** In dollars. */
	dollars: number;
}

export interface Decision {
	/** The model that answered, as asked for (`jev-latest`, `clef-flash`). */
	model: string;
	/** One per question, under the ids the questions had. */
	answers: Record<string, Answer>;
	cost: Cost;
}

/** The answer a model sent for a question, the way the server shapes it. */
export interface Evaluation {
	answers: Record<string, Answer>;
	usage: { input_tokens: number; output_tokens: number };
}
