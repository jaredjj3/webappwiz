import type { StandardSchemaV1 } from "@standard-schema/spec";

/**
 * A Contract maps method names to their schemas. Queries are reads served
 * over GET so responses are cacheable; mutations are writes served over POST.
 * Declare contracts with `satisfies Contract` to keep literal inference.
 *
 * Any Standard Schema does: `t` writes them, and so do zod, valibot and
 * arktype, so a contract can be written in whichever of those a caller already
 * has without this package knowing which.
 */
export type Contract = Record<
	string,
	{
		type: "query" | "mutation";
		input: StandardSchemaV1;
		output: StandardSchemaV1;
	}
>;

export type In<M> = M extends { input: infer S extends StandardSchemaV1 }
	? StandardSchemaV1.InferOutput<S>
	: never;
export type Out<M> = M extends { output: infer S extends StandardSchemaV1 }
	? StandardSchemaV1.InferOutput<S>
	: never;

/** Per-request handles: read `request.headers`, write `headers` on the response. */
export type Context = { request: Request; headers: Headers };

export type Handlers<C extends Contract> = {
	[K in keyof C]: (
		input: In<C[K]>,
		ctx: Context,
	) => Out<C[K]> | Promise<Out<C[K]>>;
};
