import { SchemaError } from "../schema-error";
import type { Schema } from "./schema";

export class SchemaBoolean implements Schema<boolean> {
	parse(raw: string): boolean {
		return raw !== "false";
	}

	check(value: unknown): boolean {
		if (typeof value !== "boolean") {
			throw new SchemaError([], "expected boolean");
		}
		return value;
	}
}
