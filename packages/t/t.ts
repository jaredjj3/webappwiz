import type { Infer, Schema } from "./schema";
import { SchemaArray } from "./schema-array";
import { SchemaBoolean } from "./schema-boolean";
import { SchemaEnum } from "./schema-enum";
import { SchemaNumber } from "./schema-number";
import { SchemaObject } from "./schema-object";
import { SchemaOptional } from "./schema-optional";
import { SchemaString } from "./schema-string";

export const t = {
	string: (): Schema<string> => new SchemaString(),
	number: (): Schema<number> => new SchemaNumber(),
	boolean: (): Schema<boolean> => new SchemaBoolean(),
	enum: <T extends string>(values: readonly T[]): Schema<T> =>
		new SchemaEnum(values),
	object: <P extends Record<string, Schema<unknown>>>(
		props: P,
	): Schema<{ [K in keyof P]: Infer<P[K]> }> => new SchemaObject(props),
	array: <T>(item: Schema<T>): Schema<T[]> => new SchemaArray(item),
	optional: <T>(inner: Schema<T>): Schema<T | undefined> =>
		new SchemaOptional(inner),
};
