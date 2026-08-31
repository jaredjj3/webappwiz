import { type Schema, t } from "webappwiz/t";

/**
 * The `Config` a factory's `create` returns, so a signature can name it
 * without repeating the shape: `InferConfig<typeof factory>`.
 */
export type InferConfig<F> =
	F extends ConfigFactory<infer T> ? Config<T> : never;

/**
 * A validated, frozen record of settings. One comes from a factory's `create`,
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
		private configFactory: (
			schema: Schema<T>,
			value: Record<string, unknown>,
		) => Config<T>,
	) {}

	create(value: Record<string, unknown>): Config<T> {
		return this.configFactory(this.schema, value);
	}
}
