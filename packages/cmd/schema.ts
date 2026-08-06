// A schema is anything that turns a raw arg string into a typed value.
// Structural on purpose: a zod schema satisfies this, so it's a drop-in for `t`.
export type Schema<T> = { parse: (raw: string) => T };

// ponytail: classes stay unexported — `t` is the whole public surface, so there's
// nothing to construct and nothing to subclass.
class SchemaString implements Schema<string> {
	parse(raw: string): string {
		return raw;
	}
}

class SchemaNumber implements Schema<number> {
	parse(raw: string): number {
		const n = Number(raw);
		if (Number.isNaN(n)) {
			throw new Error(`expected a number, got "${raw}"`);
		}
		return n;
	}
}

// presence flag: `--loud` is true, `--loud=false` is false
class SchemaBoolean implements Schema<boolean> {
	parse(raw: string): boolean {
		return raw !== "false";
	}
}

export const t = {
	string: (): Schema<string> => new SchemaString(),
	number: (): Schema<number> => new SchemaNumber(),
	boolean: (): Schema<boolean> => new SchemaBoolean(),
};
