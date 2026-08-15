import type { Schema } from "./schema";
import { SchemaError } from "./schema-error";

export class SchemaEnum<T extends string> implements Schema<T> {
	constructor(private values: readonly T[]) {}

	parse(raw: string): T {
		if (!this.has(raw)) {
			throw new Error(
				`expected one of ${this.values.join(", ")}, got "${raw}"`,
			);
		}
		return raw;
	}

	check(value: unknown): T {
		if (typeof value !== "string" || !this.has(value)) {
			throw new SchemaError([], `expected one of ${this.values.join(", ")}`);
		}
		return value;
	}

	private has(value: string): value is T {
		return (this.values as readonly string[]).includes(value);
	}
}
