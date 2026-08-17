import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { SafeParseResult, Schema } from "./schema";
import { SchemaError } from "./schema-error";
import { VENDOR } from "./validate";

/**
 * What every schema shares: `safeParse` written once in terms of the `parse`
 * each one implements, the JSON decoding the container schemas coerce through,
 * and the Standard Schema interface, so one implementation here makes every
 * schema in this package usable by anything that speaks it.
 */
export abstract class SchemaBase<T> implements Schema<T> {
	/**
	 * The Standard Schema interface, written once for every schema. It answers
	 * as `parse` does rather than as `coerce` does: a value arriving here has
	 * already been decoded, and coercing a string is a thing a command line
	 * needs and the interface has no room for.
	 */
	readonly "~standard": StandardSchemaV1.Props<unknown, T> = {
		version: 1,
		vendor: VENDOR,
		validate: (value: unknown) => {
			const result = this.safeParse(value);
			return result.success
				? { value: result.data }
				: {
						issues: [{ message: result.error.reason, path: result.error.path }],
					};
		},
	};

	abstract parse(value: unknown): T;

	abstract coerce(raw: string): T;

	/** Overridden only by `SchemaOptional`; everything else demands a value. */
	isOptional(): boolean {
		return false;
	}

	safeParse(value: unknown): SafeParseResult<T> {
		try {
			return { success: true, data: this.parse(value) };
		} catch (error) {
			if (error instanceof SchemaError) {
				return { success: false, error };
			}
			throw error;
		}
	}

	/** Decodes JSON as a `SchemaError`, so a bad string fails like a bad value. */
	protected decode(raw: string): unknown {
		try {
			return JSON.parse(raw);
		} catch {
			throw new SchemaError([], "expected JSON");
		}
	}
}
