import type { Schema } from "./schema";
import { SchemaBoolean } from "./schema-boolean";
import { SchemaNumber } from "./schema-number";
import { SchemaString } from "./schema-string";

// ponytail: the classes stay out of the barrel — `t` is the whole public surface.
export const t = {
	string: (): Schema<string> => new SchemaString(),
	number: (): Schema<number> => new SchemaNumber(),
	boolean: (): Schema<boolean> => new SchemaBoolean(),
};
