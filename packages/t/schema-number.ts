import { SchemaBase } from "./schema-base";
import { SchemaError } from "./schema-error";

export class SchemaNumber extends SchemaBase<number> {
	parse(value: unknown): number {
		if (typeof value !== "number" || Number.isNaN(value)) {
			throw new SchemaError([], "expected number");
		}
		return value;
	}

	coerce(raw: string): number {
		const coerced = Number(raw);
		if (Number.isNaN(coerced)) {
			throw new SchemaError([], `expected a number, got "${raw}"`);
		}
		return coerced;
	}
}
