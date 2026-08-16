import { describe, expect, it } from "bun:test";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { SchemaError } from "./schema-error";
import { t } from "./t";
import { validate } from "./validate";

/** A schema from somewhere else entirely, which is the whole point of this. */
const foreign = <T>(
	check: (value: unknown) => T,
	vendor = "elsewhere",
): StandardSchemaV1<unknown, T> => ({
	"~standard": {
		version: 1,
		vendor,
		validate: (value: unknown) => {
			try {
				return { value: check(value) };
			} catch (error) {
				return {
					issues: [{ message: String(error), path: ["some", "where"] }],
				};
			}
		},
	},
});

/** Validating, narrowed to the synchronous answer everything here gives. */
const sync = <T>(
	schema: StandardSchemaV1<unknown, T>,
	value: unknown,
): StandardSchemaV1.Result<T> => {
	const result = schema["~standard"].validate(value);
	if (result instanceof Promise) {
		throw new Error("validated asynchronously");
	}
	return result;
};

describe("t as a Standard Schema", () => {
	it("says who it is, in the shape the interface asks for", () => {
		const props = t.string()["~standard"];

		expect(props.version).toBe(1);
		expect(props.vendor).toBe("webappwiz");
	});

	it("answers a good value with the value", () => {
		expect(t.number()["~standard"].validate(42)).toEqual({ value: 42 });
	});

	it("answers a bad value with issues rather than throwing", () => {
		const result = t.number()["~standard"].validate("nope");

		expect(result).toEqual({
			issues: [{ message: "expected number", path: [] }],
		});
	});

	it("names the member that failed, so a caller can point at it", () => {
		const schema = t.object({ port: t.number() });

		const result = sync(schema, { port: "8080" });

		expect(result.issues?.[0]?.path).toEqual(["port"]);
	});

	it("validates as parse does, not as coerce does", () => {
		// A command line hands over strings and `coerce` is what reads them. The
		// interface has no room for that distinction, so it takes the stricter of
		// the two: a caller with a decoded value gets the answer they expect.
		expect(sync(t.number(), "42").issues).toBeDefined();
		expect(t.number().coerce("42")).toBe(42);
	});
});

describe("validate", () => {
	it("takes a schema from anywhere and hands back the value", () => {
		expect(validate(foreign(String), 1)).toBe("1");
		expect(validate(t.string(), "ours")).toBe("ours");
	});

	it("raises one error type however the schema was written", () => {
		const thrown = (schema: StandardSchemaV1<unknown, unknown>) => {
			try {
				validate(schema, null);
				return null;
			} catch (error) {
				return error;
			}
		};

		for (const schema of [
			t.number(),
			foreign(() => {
				throw new Error("no");
			}),
		]) {
			expect(thrown(schema)).toBeInstanceOf(SchemaError);
		}
	});

	it("keeps the path a foreign schema named", () => {
		expect(() =>
			validate(
				foreign(() => {
					throw new Error("no");
				}),
				null,
			),
		).toThrow("some.where:");
	});

	it("reads a path given as segment objects, which the spec also allows", () => {
		const segmented: StandardSchemaV1<unknown, never> = {
			"~standard": {
				version: 1,
				vendor: "elsewhere",
				validate: () => ({
					issues: [{ message: "bad", path: [{ key: "a" }, { key: 0 }] }],
				}),
			},
		};

		expect(() => validate(segmented, null)).toThrow("a.0: bad");
	});

	it("refuses a schema that validates asynchronously, saying whose it is", () => {
		const slow: StandardSchemaV1<unknown, string> = {
			"~standard": {
				version: 1,
				vendor: "somebody",
				validate: async () => ({ value: "eventually" }),
			},
		};

		expect(() => validate(slow, "x")).toThrow(
			"somebody validated asynchronously",
		);
	});

	it("refuses a failure that names no issue, rather than calling it a value", () => {
		const empty: StandardSchemaV1<unknown, never> = {
			"~standard": {
				version: 1,
				vendor: "elsewhere",
				validate: () => ({ issues: [] }),
			},
		};

		expect(() => validate(empty, null)).toThrow("invalid");
	});
});
