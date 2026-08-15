import { SchemaBase } from "./schema-base";
import { SchemaError } from "./schema-error";

export class SchemaBoolean extends SchemaBase<boolean> {
	parse(value: unknown): boolean {
		if (typeof value !== "boolean") {
			throw new SchemaError([], "expected boolean");
		}
		return value;
	}

	coerce(raw: string): boolean {
		return raw !== "false";
	}
}
