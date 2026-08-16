import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Schema } from "./schema";
import { SchemaError } from "./schema-error";

/** The name this package gives as a Standard Schema vendor. */
export const VENDOR = "webappwiz";

/**
 * Whether a schema is one of ours, and so can be asked the things the Standard
 * Schema interface has no room for: reading a raw string, above all, which is
 * what a command line is made of.
 *
 * Compared by vendor rather than by `instanceof`, which two copies of this
 * package in one install would fail. Not by whether the methods happen to be
 * there either: zod has an `isOptional` of its own, so a name is not evidence.
 */
export function ours<T>(
	schema: StandardSchemaV1<unknown, T>,
): schema is Schema<T> {
	return schema["~standard"].vendor === VENDOR;
}

/**
 * Validates through any Standard Schema, whether it came from `t` or from zod,
 * valibot or arktype. Throws a `SchemaError` naming the path that failed, so a
 * caller handles one error type however the schema reaching it was written.
 *
 * ```ts
 * const port = validate(z.coerce.number(), "8080");
 * ```
 */
export function validate<T>(
	schema: StandardSchemaV1<unknown, T>,
	value: unknown,
): T {
	const result = schema["~standard"].validate(value);
	if (result instanceof Promise) {
		// Nothing here has anywhere to await: `cmd` binds a command line
		// synchronously on purpose, so a command with no middleware stays
		// synchronous. Refusing says which schema to swap out, rather than handing
		// back a promise dressed as a value.
		throw new SchemaError(
			[],
			`${schema["~standard"].vendor} validated asynchronously, which is not supported here`,
		);
	}
	if (result.issues === undefined) {
		return result.value;
	}
	const [issue] = result.issues;
	if (issue === undefined) {
		// The spec says a failure carries issues; one that says it failed and
		// names nothing would otherwise return undefined as a value.
		throw new SchemaError([], "invalid");
	}
	// The first issue only, which is what `t` reports too: a `SchemaError` names
	// one path and one reason, and the first is the one a caller acts on.
	throw new SchemaError(path(issue), issue.message);
}

/** A Standard Schema path, as the string path a `SchemaError` carries. */
function path(issue: StandardSchemaV1.Issue): string[] {
	return [...(issue.path ?? [])].map((segment) =>
		String(typeof segment === "object" ? segment.key : segment),
	);
}
