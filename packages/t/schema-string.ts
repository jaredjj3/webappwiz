import type { Schema } from "./schema";

export class SchemaString implements Schema<string> {
	parse(raw: string): string {
		return raw;
	}
}
