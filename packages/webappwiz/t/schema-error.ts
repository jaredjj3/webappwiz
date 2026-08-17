export class SchemaError extends Error {
	constructor(
		readonly path: string[],
		readonly reason: string,
	) {
		super(path.length ? `${path.join(".")}: ${reason}` : reason);
	}

	/** For container schemas, naming which member failed. */
	at(key: string): SchemaError {
		return new SchemaError([key, ...this.path], this.reason);
	}
}
