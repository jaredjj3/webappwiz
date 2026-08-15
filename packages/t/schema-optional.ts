import type { Schema } from "./schema";
import { SchemaBase } from "./schema-base";

export class SchemaOptional<T> extends SchemaBase<T | undefined> {
	constructor(private inner: Schema<T>) {
		super();
	}

	override isOptional(): boolean {
		return true;
	}

	parse(value: unknown): T | undefined {
		return value === undefined ? undefined : this.inner.parse(value);
	}

	/**
	 * Absence is `parse`'s business, not this one's: a caller that has nothing
	 * to coerce has no string to hand over, and `cmd` resolves a missing option
	 * to its default before ever getting here. An empty string is a value, so
	 * the inner schema decides what it means, the way `z.coerce` does.
	 */
	coerce(raw: string): T | undefined {
		return this.inner.coerce(raw);
	}
}
