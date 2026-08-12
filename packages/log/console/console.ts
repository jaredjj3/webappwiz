/**
 * The two methods `ConsoleLogger` writes through. Narrow on purpose: the
 * global `console` satisfies it as it is, and a test can implement it in a
 * few lines rather than faking the whole console API.
 */
export interface Console {
	log(message: unknown, ...optionalParams: unknown[]): void;
	error(message: unknown, ...optionalParams: unknown[]): void;
}
