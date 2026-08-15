import type { SchemaError } from "./schema-error";

/** What `safeParse` hands back rather than throwing. */
export type SafeParseResult<T> =
	| { success: true; data: T }
	| { success: false; error: SchemaError };

export interface Schema<T> {
	/**
	 * Validates an already-decoded value, e.g. parsed JSON. Throws a
	 * `SchemaError` naming the path that failed.
	 */
	parse(value: unknown): T;
	/**
	 * Coerces a raw string, a CLI argument say, and validates the result. The
	 * counterpart to zod's `z.coerce`.
	 */
	coerce(raw: string): T;
	/** `parse`, returning the error instead of throwing it. */
	safeParse(value: unknown): SafeParseResult<T>;
	/**
	 * Whether `undefined` is a value this schema accepts, so a caller binding
	 * arguments knows an absent one is allowed rather than missing.
	 */
	isOptional(): boolean;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;
