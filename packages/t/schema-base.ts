import type { SafeParseResult, Schema } from "./schema";
import { SchemaError } from "./schema-error";

/**
 * What every schema shares: `safeParse` written once in terms of the `parse`
 * each one implements, and the JSON decoding the container schemas coerce
 * through.
 */
export abstract class SchemaBase<T> implements Schema<T> {
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
