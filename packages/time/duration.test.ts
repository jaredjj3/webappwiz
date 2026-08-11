import { describe, expect, it } from "bun:test";

import { Duration } from "./index";

describe("Duration", () => {
	it("converts between units", () => {
		expect(Duration.secs(90).mins).toBe(1.5);
		expect(Duration.days(1).hrs).toBe(24);
		expect(Duration.mins(2).ms).toBe(120_000);
	});

	it("returns new durations from arithmetic, leaving the original unchanged", () => {
		const one = Duration.secs(1);
		const two = one.add(one);

		expect(one.ms).toBe(1000);
		expect(two.ms).toBe(2000);
		expect(two.subtract(one).isEqual(one)).toBe(true);
		expect(one.multiply(3).isEqual(Duration.secs(3))).toBe(true);
		expect(one.negate().isLessThan(Duration.zero())).toBe(true);
	});

	it("holds a value between bounds when clamping", () => {
		const bounds = [Duration.secs(1), Duration.secs(3)] as const;

		expect(Duration.zero().clamp(...bounds).secs).toBe(1);
		expect(Duration.secs(2).clamp(...bounds).secs).toBe(2);
		expect(Duration.secs(9).clamp(...bounds).secs).toBe(3);
	});

	it("reads out in the largest unit that still says something", () => {
		expect(Duration.ms(840).human()).toBe("840ms");
		expect(Duration.ms(999.6).human()).toBe("1000ms");
		expect(Duration.secs(4.23).human()).toBe("4.2s");
		expect(Duration.secs(59.9).human()).toBe("59.9s");
		expect(Duration.secs(125).human()).toBe("2m 05s");
	});

	it("picks the extremes with min and max", () => {
		const durations = [Duration.secs(5), Duration.secs(1), Duration.secs(3)];

		expect(Duration.min(...durations).secs).toBe(1);
		expect(Duration.max(...durations).secs).toBe(5);
		expect(Duration.min().ms).toBe(Number.POSITIVE_INFINITY);
		expect(Duration.max().ms).toBe(Number.NEGATIVE_INFINITY);
	});
});
