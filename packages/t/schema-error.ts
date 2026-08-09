export class SchemaError extends Error {
	constructor(
		readonly path: string[],
		readonly reason: string,
	) {
		super(path.length ? `${path.join(".")}: ${reason}` : reason);
	}

	/** Returns a copy with `key` prepended to the path, for container schemas. */
	at(key: string): SchemaError {
		return new SchemaError([key, ...this.path], this.reason);
	}
}
