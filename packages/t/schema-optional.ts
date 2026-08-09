import type { Schema } from "./schema";

export class SchemaOptional<T> implements Schema<T | undefined> {
	constructor(private inner: Schema<T>) {}

	parse(raw: string): T | undefined {
		return this.inner.parse(raw);
	}

	check(value: unknown): T | undefined {
		return value === undefined ? undefined : this.inner.check(value);
	}
}
