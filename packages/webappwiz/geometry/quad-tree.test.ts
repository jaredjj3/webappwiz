import { describe, expect, it } from "bun:test";

import { QuadTree, Rect } from "./index";

const BOUNDS = new Rect(0, 0, 100, 100);

/** A 1x1 rect, small enough to sit inside a quadrant however deep it goes. */
const dot = (left: number, top: number) => new Rect(left, top, 1, 1);

describe("QuadTree", () => {
	it("finds what overlaps the area", () => {
		const tree = new QuadTree<string>(BOUNDS);
		tree.insert("near", dot(10, 10));
		tree.insert("far", dot(90, 90));

		expect(tree.query(new Rect(0, 0, 20, 20))).toEqual(["near"]);
	});

	it("finds nothing where nothing is", () => {
		const tree = new QuadTree<string>(BOUNDS);
		tree.insert("near", dot(10, 10));

		expect(tree.query(new Rect(50, 50, 10, 10))).toEqual([]);
	});

	it("returns an item once even when the area spans the quadrants it splits into", () => {
		const tree = new QuadTree<number>(BOUNDS, { capacity: 2 });
		for (let index = 0; index < 20; index++) {
			tree.insert(index, dot(index * 4, index * 4));
		}

		const found = tree.query(BOUNDS);

		expect(found).toHaveLength(20);
		expect(new Set(found).size).toBe(20);
	});

	it("keeps an item that straddles two quadrants, which fits in neither", () => {
		const tree = new QuadTree<string>(BOUNDS, { capacity: 1 });
		tree.insert("left", dot(10, 10));
		tree.insert("right", dot(90, 10));
		tree.insert("across", new Rect(40, 40, 20, 20));

		expect(tree.query(new Rect(45, 45, 1, 1))).toEqual(["across"]);
		expect(tree.size).toBe(3);
	});

	it("still finds an item lying outside the tree's own bounds", () => {
		const tree = new QuadTree<string>(BOUNDS);
		tree.insert("outside", dot(500, 500));

		expect(tree.query(new Rect(499, 499, 3, 3))).toEqual(["outside"]);
	});

	it("stops splitting rather than chase items stacked on one point", () => {
		const tree = new QuadTree<number>(BOUNDS, { capacity: 1, maxDepth: 2 });
		for (let index = 0; index < 50; index++) {
			tree.insert(index, dot(10, 10));
		}

		expect(tree.query(new Rect(9, 9, 3, 3))).toHaveLength(50);
	});

	it("counts what it holds, and empties", () => {
		const tree = new QuadTree<number>(BOUNDS, { capacity: 1 });
		tree.insert(1, dot(10, 10));
		tree.insert(2, dot(90, 90));

		expect(tree.size).toBe(2);

		tree.clear();

		expect(tree.size).toBe(0);
		expect(tree.query(BOUNDS)).toEqual([]);
	});
});
