/** A model refused or failed a request; `status` is the HTTP status, if any. */
export class DecisionFailure extends Error {
	constructor(
		message: string,
		readonly status?: number,
	) {
		super(message);
		this.name = "DecisionFailure";
	}
}
