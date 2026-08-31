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

class ConfigFactory<T extends Record<string, unknown>> {
	constructor(
		private schema: Schema<T>,
		// handed over by `Config.factory` so the `Config` constructor stays
		// private
		private configFactory: (
			schema: Schema<T>,
			value: Record<string, unknown>,
		) => Config<T>,
	) {}

	create(value: Record<string, unknown>): Config<T> {
		return this.configFactory(this.schema, value);
	}
}
