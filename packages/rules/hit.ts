/** A problem a check found, before the run stamps file and severity on it. */
export class Hit {
	constructor(
		/** 1-based. */
		readonly line: number,
		/** 1-based. */
		readonly column: number,
		readonly message: string,
	) {}
}
