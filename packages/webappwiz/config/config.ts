import { type Schema, t } from "webappwiz/t";

/**
 * The `Config` a factory's `parse` returns, so a signature can name it
 * without repeating the shape: `InferConfig<typeof factory>`.
 */
export type InferConfig<F> =
	F extends ConfigFactory<infer T> ? Config<T> : never;

/**
 * A validated, frozen record of settings. One comes from a factory's `parse`,
 * never a constructor, so holding a `Config<T>` means the value already passed
 * its schema.
 */
export class Config<T extends Record<string, unknown>> {
	private readonly value: T;

	private constructor(
		private readonly schema: Schema<T>,
		value: Record<string, unknown>,
	) {
		this.value = Object.freeze(this.schema.parse(value));
	}

	/** Builds the factory for a shape of settings, one schema per key. */
	static factory<P extends Record<string, Schema<unknown>>>(props: P) {
		const schema = t.object(props);
		return new ConfigFactory(
			schema,
			props,
			(schema, value) => new Config(schema, value),
		);
	}

	get<K extends keyof T>(key: K): T[K] {
		return this.value[key];
	}

	/**
	 * A new `Config` with `updates` merged over this one, revalidated, so an
	 * update cannot smuggle in a value the schema rejects.
	 */
	update(updates: Record<string, unknown>): Config<T> {
		return new Config(this.schema, { ...this.value, ...updates });
	}

	toRecord(): T {
		return this.value;
	}
}

// Exported so a declaration in another package can name the type of a held
// factory: tsc refuses to inline it (TS4094, its fields are private).
// rule-ignore one-class-per-file: the value Config.factory returns; a separate file would hide that it exists only to keep Config's constructor private
export class ConfigFactory<T extends Record<string, unknown>> {
	// rule-ignore objects-over-callbacks: the callback is Config's private constructor, handed over by Config.factory; an interface would force it public
	constructor(
		private schema: Schema<T>,
		private props: Record<string, Schema<unknown>>,
		private configFactory: (
			schema: Schema<T>,
			value: Record<string, unknown>,
		) => Config<T>,
	) {}

	/** Parses `value` against the schema into a `Config`. */
	parse(value: Record<string, unknown>): Config<T> {
		return this.configFactory(this.schema, value);
	}

	/**
	 * Coerces each declared key from its raw string, then parses, so a record
	 * of env-style strings (`process.env`) can hydrate a `Config`. A key absent
	 * from `record` stays absent, letting an optional schema decide what that
	 * means.
	 */
	coerce(record: Record<string, string | undefined>): Config<T> {
		const value: Record<string, unknown> = {};
		for (const [key, schema] of Object.entries(this.props)) {
			const raw = record[key];
			if (raw !== undefined) {
				value[key] = schema.coerce(raw);
			}
		}
		return this.parse(value);
	}
}
