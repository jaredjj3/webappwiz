import type { Schema } from "./schema";
import { SchemaError } from "./schema-error";

export class SchemaArray<T> implements Schema<T[]> {
	constructor(private item: Schema<T>) {}

	parse(raw: string): T[] {
		return this.check(JSON.parse(raw));
	}

	check(value: unknown): T[] {
		if (!Array.isArray(value)) {
			throw new SchemaError([], "expected array");
		}
		return value.map((item, i) => {
			try {
				return this.item.check(item);
			} catch (e) {
				throw e instanceof SchemaError ? e.at(String(i)) : e;
			}
		});
	}
}
