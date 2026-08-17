import { describe, expect, it } from "bun:test";

import { Position } from "./index";

describe("Position", () => {
	it("measures itself from another point", () => {
		const point = new Position(30, 40);

		expect(
			point.relativeTo({ x: 10, y: 10 }).isEqual(new Position(20, 30)),
		).toBe(true);
	});

	it("leaves the original alone when moving", () => {
		const point = new Position(30, 40);

		expect(point.translate(-30, -40).isEqual(Position.origin())).toBe(true);
		expect(point.isEqual(new Position(30, 40))).toBe(true);
	});

	it("reads the viewport coordinates off an event", () => {
		expect(
			Position.fromEvent({ clientX: 5, clientY: 6 }).isEqual(
				new Position(5, 6),
			),
		).toBe(true);
	});
});
