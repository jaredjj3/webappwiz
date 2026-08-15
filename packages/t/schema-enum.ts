import { SchemaBase } from "./schema-base";
import { SchemaError } from "./schema-error";

export class SchemaEnum<T extends string> extends SchemaBase<T> {
	constructor(private values: readonly T[]) {
		super();
	}

	parse(value: unknown): T {
		if (typeof value !== "string" || !this.has(value)) {
			throw new SchemaError([], `expected one of ${this.values.join(", ")}`);
		}
		return value;
	}

	coerce(raw: string): T {
		if (!this.has(raw)) {
			throw new SchemaError(
				[],
				`expected one of ${this.values.join(", ")}, got "${raw}"`,
			);
		}
		return raw;
	}

	private has(value: string): value is T {
		return (this.values as readonly string[]).includes(value);
	}
}
