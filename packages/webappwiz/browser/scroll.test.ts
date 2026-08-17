import "../../../setup";
import { beforeEach, describe, expect, it } from "bun:test";

import { Scroll } from "./index";

/** Lets the two animation frames `Scroll` waits on come round. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

type Scrolled = { behavior?: ScrollBehavior; block?: ScrollLogicalPosition };

describe("Scroll", () => {
	let target: HTMLElement;
	let scrolled: Scrolled[];

	beforeEach(() => {
		document.body.innerHTML = "";
		target = document.createElement("div");
		document.body.append(target);

		// happy-dom lays nothing out, so every rect is 0x0 at the origin and the
		// target would read as already visible. Put it below the fold by hand.
		target.getBoundingClientRect = () =>
			({ top: 2000, bottom: 2100, left: 0, right: 100 }) as DOMRect;

		scrolled = [];
		target.scrollIntoView = (arg?: boolean | ScrollIntoViewOptions) => {
			scrolled.push(typeof arg === "object" ? arg : {});
		};
	});

	it("brings the bottom edge into view by default", async () => {
		Scroll.reveal(target);
		await settle();

		expect(scrolled).toEqual([{ behavior: "smooth", block: "end" }]);
	});

	it("brings the top edge into view when asked to", async () => {
		Scroll.toTop(target);
		await settle();

		expect(scrolled).toEqual([{ behavior: "smooth", block: "start" }]);
	});

	it("settles a burst of requests into one scroll", async () => {
		Scroll.reveal(target);
		Scroll.reveal(target);
		Scroll.reveal(target);
		await settle();

		expect(scrolled.length).toBe(1);
	});

	it("leaves a target that is already on screen where it is", async () => {
		target.getBoundingClientRect = () =>
			({ top: 10, bottom: 110, left: 0, right: 100 }) as DOMRect;

		Scroll.reveal(target);
		await settle();

		expect(scrolled).toEqual([]);
	});

	it("counts a target below a scrollable ancestor's fold as off screen", async () => {
		const pane = document.createElement("div");
		pane.style.overflowY = "auto";
		pane.getBoundingClientRect = () =>
			({ top: 0, bottom: 200, left: 0, right: 100 }) as DOMRect;
		pane.append(target);
		document.body.append(pane);
		// Inside the viewport, but past the pane's own fold at 200.
		target.getBoundingClientRect = () =>
			({ top: 300, bottom: 400, left: 0, right: 100 }) as DOMRect;

		Scroll.reveal(target);
		await settle();

		expect(scrolled.length).toBe(1);
	});

	it("does nothing for a target that is not there yet", async () => {
		Scroll.reveal(() => null);
		await settle();

		expect(scrolled).toEqual([]);
	});

	it("leaves room at the bottom for whatever covers the fold", async () => {
		Scroll.reveal(target, { bottomInset: 64 });
		await settle();

		expect(target.style.scrollMarginBottom).toBe("64px");
	});

	it("does not compound the inset when asked twice", async () => {
		Scroll.reveal(target, { bottomInset: 64 });
		await settle();
		Scroll.reveal(target, { bottomInset: 64 });
		await settle();

		expect(target.style.scrollMarginBottom).toBe("64px");
	});
});
