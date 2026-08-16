import "../../../setup";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { FakeTimer } from "@webappwiz/time/testing";

import { WindowUserActivationObserver } from "../index";

// happy-dom has no navigator.userActivation, and a real browser will not give
// one out without a real gesture, so the test owns the flags either way.
const activation = { isActive: false, hasBeenActive: false };

const activate = () => {
	activation.isActive = true;
	activation.hasBeenActive = true;
	window.dispatchEvent(new Event("pointerdown"));
};

describe("WindowUserActivationObserver", () => {
	let timer: FakeTimer;
	let observer: WindowUserActivationObserver;

	beforeEach(() => {
		activation.isActive = false;
		activation.hasBeenActive = false;
		Object.defineProperty(navigator, "userActivation", {
			configurable: true,
			get: () => activation,
		});
		timer = new FakeTimer();
		observer = new WindowUserActivationObserver(timer);
	});

	afterEach(() => {
		observer.dispose();
	});

	it("reports no activation before the user has done anything", () => {
		expect(observer.isActive()).toBe(false);
		expect(observer.hasBeenActive()).toBe(false);
	});

	it("notices the gesture that activates the page", () => {
		let changes = 0;
		observer.events.on("change", () => changes++);

		activate();

		expect(observer.isActive()).toBe(true);
		expect(changes).toBe(1);
	});

	it("polls for the lapse, which fires no event of its own", () => {
		activate();
		let changes = 0;
		observer.events.on("change", () => changes++);

		activation.isActive = false;
		timer.fireIntervals();

		expect(observer.isActive()).toBe(false);
		expect(changes).toBe(1);
	});

	it("stops polling once the activation has lapsed", () => {
		activate();
		activation.isActive = false;
		timer.fireIntervals();

		expect(timer.intervals.every((entry) => entry.disposed)).toBe(true);
	});

	it("waits for a gesture that has not happened yet", async () => {
		let waited = false;
		void observer.wait().then(() => {
			waited = true;
		});

		expect(waited).toBe(false);

		activate();
		await Promise.resolve();

		expect(waited).toBe(true);
	});

	it("does not wait at all once the page has been activated", async () => {
		activate();

		await observer.wait();
	});
});
