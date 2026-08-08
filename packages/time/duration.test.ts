import { expect, test } from "bun:test";

import { Duration } from "./index";

test("converts between units", () => {
	expect(Duration.secs(90).mins).toBe(1.5);
	expect(Duration.days(1).hrs).toBe(24);
	expect(Duration.mins(2).ms).toBe(120_000);
});

test("arithmetic returns new durations", () => {
	const one = Duration.secs(1);
	const two = one.add(one);

	expect(one.ms).toBe(1000);
	expect(two.ms).toBe(2000);
	expect(two.subtract(one).isEqual(one)).toBe(true);
	expect(one.multiply(3).isEqual(Duration.secs(3))).toBe(true);
	expect(one.negate().isLessThan(Duration.zero())).toBe(true);
});

test("clamp holds a value between bounds", () => {
	const bounds = [Duration.secs(1), Duration.secs(3)] as const;

	expect(Duration.zero().clamp(...bounds).secs).toBe(1);
	expect(Duration.secs(2).clamp(...bounds).secs).toBe(2);
	expect(Duration.secs(9).clamp(...bounds).secs).toBe(3);
});

test("min and max pick the extremes", () => {
	const durations = [Duration.secs(5), Duration.secs(1), Duration.secs(3)];

	expect(Duration.min(...durations).secs).toBe(1);
	expect(Duration.max(...durations).secs).toBe(5);
	expect(Duration.min().ms).toBe(Number.POSITIVE_INFINITY);
	expect(Duration.max().ms).toBe(Number.NEGATIVE_INFINITY);
});
