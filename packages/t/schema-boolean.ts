import type { Schema } from "./schema";

export class SchemaBoolean implements Schema<boolean> {
	parse(raw: string): boolean {
		return raw !== "false";
	}
}
