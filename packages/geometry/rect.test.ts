import { describe, expect, it } from "bun:test";

import { Position, Rect } from "./index";

describe("Rect", () => {
	it("reads its edges from the top left corner", () => {
		const rect = new Rect(10, 20, 30, 40);

		expect(rect.left).toBe(10);
		expect(rect.top).toBe(20);
		expect(rect.right).toBe(40);
		expect(rect.bottom).toBe(60);
		expect(rect.area).toBe(1200);
	});

	it("treats edge-touching rects as clear of each other", () => {
		const left = new Rect(0, 0, 10, 10);
		const right = new Rect(10, 0, 10, 10);

		expect(left.intersects(right)).toBe(false);
		expect(left.intersection(right)).toBeNull();
	});

	it("returns the overlapping region of intersecting rects", () => {
		const one = new Rect(0, 0, 10, 10);
		const two = new Rect(5, 5, 10, 10);

		expect(one.intersects(two)).toBe(true);
		expect(one.intersection(two)?.isEqual(new Rect(5, 5, 5, 5))).toBe(true);
	});

	it("holds both rects in their union", () => {
		const one = new Rect(0, 0, 10, 10);
		const two = new Rect(20, 5, 10, 10);

		expect(one.union(two).isEqual(new Rect(0, 0, 30, 15))).toBe(true);
	});

	it("contains points and rects up to and including its edges", () => {
		const rect = new Rect(0, 0, 10, 10);

		expect(rect.contains(new Position(5, 5))).toBe(true);
		expect(rect.contains(new Position(10, 10))).toBe(true);
		expect(rect.contains(new Position(11, 5))).toBe(false);
		expect(rect.containsRect(new Rect(0, 0, 10, 10))).toBe(true);
		expect(rect.containsRect(new Rect(5, 5, 10, 10))).toBe(false);
	});

	it("leaves the original alone when moving", () => {
		const rect = new Rect(1, 2, 3, 4);
		const moved = rect.translate(10, 10);

		expect(rect.isEqual(new Rect(1, 2, 3, 4))).toBe(true);
		expect(moved.isEqual(new Rect(11, 12, 3, 4))).toBe(true);
		expect(moved.atOrigin().isEqual(new Rect(0, 0, 3, 4))).toBe(true);
	});

	it("reads a DOMRect straight off an element", () => {
		const rect = Rect.fromDomRect({ x: 1, y: 2, width: 3, height: 4 });

		expect(rect.isEqual(new Rect(1, 2, 3, 4))).toBe(true);
	});
});
