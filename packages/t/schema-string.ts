import { SchemaBase } from "./schema-base";
import { SchemaError } from "./schema-error";

export class SchemaString extends SchemaBase<string> {
	parse(value: unknown): string {
		if (typeof value !== "string") {
			throw new SchemaError([], "expected string");
		}
		return value;
	}

	coerce(raw: string): string {
		return raw;
	}
}
