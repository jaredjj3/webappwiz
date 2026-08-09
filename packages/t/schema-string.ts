import type { Schema } from "./schema";
import { SchemaError } from "./schema-error";

export class SchemaString implements Schema<string> {
	parse(raw: string): string {
		return raw;
	}

	check(value: unknown): string {
		if (typeof value !== "string") {
			throw new SchemaError([], "expected string");
		}
		return value;
	}
}
