import type { Schema } from "./schema";
import { SchemaBase } from "./schema-base";

export class SchemaNullable<T> extends SchemaBase<T | null> {
	constructor(private inner: Schema<T>) {
		super();
	}

	parse(value: unknown): T | null {
		return value === null ? null : this.inner.parse(value);
	}

	/**
	 * A string in hand is a value, never null, so the inner schema decides what
	 * it means, the same call `SchemaOptional` makes for absence.
	 */
	coerce(raw: string): T | null {
		return this.inner.coerce(raw);
	}
}
