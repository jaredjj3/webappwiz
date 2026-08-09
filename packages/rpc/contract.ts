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
		/** Cache-Control header for query responses, e.g. "max-age=60". */
		cache?: string;
	}
>;

export type In<M> = M extends { input: Schema<infer I> } ? I : never;
export type Out<M> = M extends { output: Schema<infer O> } ? O : never;

export type Handlers<C extends Contract> = {
	[K in keyof C]: (input: In<C[K]>) => Out<C[K]> | Promise<Out<C[K]>>;
};
