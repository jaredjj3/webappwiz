import { describe, expect, it } from "bun:test";

import { Duration, timeAgo } from "./index";

describe("timeAgo", () => {
	it("calls anything within five seconds just now", () => {
		expect(timeAgo(Duration.zero())).toBe("just now");
		expect(timeAgo(Duration.secs(4))).toBe("just now");
	});

	it("climbs to the largest unit that still says something", () => {
		expect(timeAgo(Duration.secs(30))).toBe("30 seconds ago");
		expect(timeAgo(Duration.mins(5))).toBe("5 minutes ago");
		expect(timeAgo(Duration.hrs(3))).toBe("3 hours ago");
		expect(timeAgo(Duration.days(2))).toBe("2 days ago");
	});

	it("drops the plural for exactly one of a unit", () => {
		expect(timeAgo(Duration.mins(1))).toBe("1 minute ago");
		expect(timeAgo(Duration.hrs(1))).toBe("1 hour ago");
		expect(timeAgo(Duration.days(1))).toBe("1 day ago");
	});

	it("rounds down rather than up to the next unit", () => {
		expect(timeAgo(Duration.secs(59))).toBe("59 seconds ago");
		expect(timeAgo(Duration.mins(59))).toBe("59 minutes ago");
		expect(timeAgo(Duration.hrs(23))).toBe("23 hours ago");
	});

	it("reads a negative gap as just now, since a clock correction makes them", () => {
		expect(timeAgo(Duration.secs(-30))).toBe("just now");
	});
});
