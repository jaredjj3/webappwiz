/** Compares two values by their own enumerable keys, one level deep. */
export function shallowEqual<T>(a: T, b: T): boolean {
	if (Object.is(a, b)) {
		return true;
	}
	if (
		typeof a !== "object" ||
		typeof b !== "object" ||
		a === null ||
		b === null
	) {
		return false;
	}
	const keysA = Object.keys(a);
	const keysB = Object.keys(b);
	if (keysA.length !== keysB.length) {
		return false;
	}
	return keysA.every(
		(key) =>
			Object.hasOwn(b, key) &&
			Object.is(
				(a as Record<string, unknown>)[key],
				(b as Record<string, unknown>)[key],
			),
	);
}
