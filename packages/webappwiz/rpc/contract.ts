import type { StandardSchemaV1 } from "@standard-schema/spec";

export type Output =
	| StandardSchemaV1
	| { format: "json"; schema: StandardSchemaV1 }
	| { format: "text" }
	| { format: "file" }
	| { format: "empty" };
export type FileFields = Record<string, "file" | "files">;
/** Plain schemas remain shorthand for JSON. Attachments require a mutation. */
export type Contract = Record<
	string,
	{ input: StandardSchemaV1; output: Output } & (
		| { type: "query"; files?: never }
		| { type: "mutation"; files?: FileFields }
	)
>;
export type In<M> = M extends { input: infer S extends StandardSchemaV1 }
	? StandardSchemaV1.InferOutput<S>
	: never;
type SchemaInput<S extends StandardSchemaV1> =
	unknown extends StandardSchemaV1.InferInput<S>
		? StandardSchemaV1.InferOutput<S>
		: StandardSchemaV1.InferInput<S>;
export type ClientInput<M> = M extends {
	input: infer S extends StandardSchemaV1;
}
	? SchemaInput<S>
	: never;
type OutputSchema<M> = M extends { output: infer S extends StandardSchemaV1 }
	? S
	: M extends { output: { schema: infer S extends StandardSchemaV1 } }
		? S
		: never;
/** Buffered download. Creating an object URL or saving it is the caller's choice. */
export type FileResult = { data: Blob; contentType: string; filename?: string };
type Formatted<M> = M extends { output: { format: "text" } }
	? string
	: M extends { output: { format: "file" } }
		? FileResult
		: M extends { output: { format: "empty" } }
			? undefined
			: never;
export type Out<M> = [OutputSchema<M>] extends [never]
	? Formatted<M>
	: StandardSchemaV1.InferOutput<OutputSchema<M>>;
export type HandlerOutput<M> = [OutputSchema<M>] extends [never]
	? Formatted<M>
	: SchemaInput<OutputSchema<M>>;
export type Files<M> = M extends { files: infer F extends FileFields }
	? { [K in keyof F]: F[K] extends "files" ? File[] : File }
	: Record<string, never>;
/** Per-request handles. Attachment fields are inferred from the operation. */
export type Context<M = unknown> = {
	request: Request;
	headers: Headers;
	files: Files<M>;
};
export type Handlers<C extends Contract> = {
	[K in keyof C]: (
		input: In<C[K]>,
		ctx: Context<C[K]>,
	) => HandlerOutput<C[K]> | Promise<HandlerOutput<C[K]>>;
};
