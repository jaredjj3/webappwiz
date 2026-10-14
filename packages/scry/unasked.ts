/**
 * What a decider throws for a question it will not ask a model: one the
 * caller disabled, or one past the budget. A rule that lets it through goes
 * unchecked on the file, and the report says why rather than that it broke.
 */
export class Unasked extends Error {
	constructor(
		/** Why, as the report says it, like `disabled with --disable llm`. */
		reason: string,
		/** Whether the model was disabled, or its budget ran out. */
		readonly kind: "disabled" | "budget",
	) {
		super(reason);
	}
}
