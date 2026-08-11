export interface Schema<T> {
	/** Parses a raw CLI string. */
	parse(raw: string): T;
	/** Validates an already-decoded value, e.g. parsed JSON. */
	check(value: unknown): T;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;
