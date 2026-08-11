import { SchemaError } from "../schema-error";
import type { Schema } from "./schema";

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
