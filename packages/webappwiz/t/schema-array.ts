import type { Schema } from "./schema";
import { SchemaBase } from "./schema-base";
import { SchemaError } from "./schema-error";

export class SchemaArray<T> extends SchemaBase<T[]> {
	constructor(private item: Schema<T>) {
		super();
	}

	parse(value: unknown): T[] {
		if (!Array.isArray(value)) {
			throw new SchemaError([], "expected array");
		}
		return value.map((item, i) => {
			try {
				return this.item.parse(item);
			} catch (e) {
				throw e instanceof SchemaError ? e.at(String(i)) : e;
			}
		});
	}

	coerce(raw: string): T[] {
		return this.parse(this.decode(raw));
	}
}
