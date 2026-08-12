import { SchemaError } from "../schema-error";
import type { Schema } from "./schema";

export class SchemaNumber implements Schema<number> {
	parse(raw: string): number {
		const parsed = Number(raw);
		if (Number.isNaN(parsed)) {
			throw new Error(`expected a number, got "${raw}"`);
		}
		return parsed;
	}

	check(value: unknown): number {
		if (typeof value !== "number" || Number.isNaN(value)) {
			throw new SchemaError([], "expected number");
		}
		return value;
	}
}
