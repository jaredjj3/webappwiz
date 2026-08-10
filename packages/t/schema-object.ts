import type { Infer, Schema } from "./schema";
import { SchemaError } from "./schema-error";

export class SchemaObject<P extends Record<string, Schema<unknown>>>
	implements Schema<{ [K in keyof P]: Infer<P[K]> }>
{
	constructor(private props: P) {}

	parse(raw: string): { [K in keyof P]: Infer<P[K]> } {
		return this.check(JSON.parse(raw));
	}

	check(value: unknown): { [K in keyof P]: Infer<P[K]> } {
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			throw new SchemaError([], "expected object");
		}
		const out: Record<string, unknown> = {};
		for (const [key, schema] of Object.entries(this.props)) {
			try {
				out[key] = schema.check((value as Record<string, unknown>)[key]);
			} catch (e) {
				throw e instanceof SchemaError ? e.at(key) : e;
			}
		}
		// extra keys are dropped, not rejected — add a strict mode if someone
		// needs one
		return out as { [K in keyof P]: Infer<P[K]> };
	}
}
