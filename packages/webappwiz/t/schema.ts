import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { SchemaError } from "./schema-error";

/** What `safeParse` hands back rather than throwing. */
export type SafeParseResult<T> =
	| { success: true; data: T }
	| { success: false; error: SchemaError };

/**
 * A schema, which is also a Standard Schema: `~standard` is what lets anything
 * speaking that interface validate through one of these without knowing what
 * `t` is, and it is the same interface zod, valibot and arktype expose, so a
 * caller who would rather use one of those can hand it wherever these go.
 */
export interface Schema<T> extends StandardSchemaV1<unknown, T> {
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
