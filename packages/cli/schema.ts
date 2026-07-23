// A schema is anything that turns a raw arg string into a typed value.
// Structural on purpose: a zod schema satisfies this, so it's a drop-in for `t`.
export type Schema<T> = { parse: (raw: string) => T };

export const t = {
	string: { parse: (raw) => raw } as Schema<string>,
	number: {
		parse: (raw) => {
			const n = Number(raw);
			if (Number.isNaN(n)) {
				throw new Error(`expected a number, got "${raw}"`);
			}
			return n;
		},
	} as Schema<number>,
	// presence flag: `--loud` is true, `--loud=false` is false
	boolean: { parse: (raw) => raw !== "false" } as Schema<boolean>,
};
