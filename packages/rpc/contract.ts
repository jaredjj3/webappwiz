import type { Schema } from "@webappwiz/t";

/**
 * A Contract maps method names to their schemas. Queries are reads served
 * over GET so responses are cacheable; mutations are writes served over POST.
 * Declare contracts with `satisfies Contract` to keep literal inference.
 */
export type Contract = Record<
	string,
	{
		type: "query" | "mutation";
		input: Schema<unknown>;
		output: Schema<unknown>;
	}
>;

export type In<M> = M extends { input: Schema<infer I> } ? I : never;
export type Out<M> = M extends { output: Schema<infer O> } ? O : never;

/** Per-request handles: read `request.headers`, write `headers` on the response. */
export type Context = { request: Request; headers: Headers };

export type Handlers<C extends Contract> = {
	[K in keyof C]: (
		input: In<C[K]>,
		ctx: Context,
	) => Out<C[K]> | Promise<Out<C[K]>>;
};
