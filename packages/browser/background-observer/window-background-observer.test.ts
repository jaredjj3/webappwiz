import "../../../test-setup";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { WindowBackgroundObserver } from "../index";

/** happy-dom always reports the document focused, so the test says otherwise. */
const setFocused = (focused: boolean) => {
	document.hasFocus = () => focused;
};

const setVisibility = (state: DocumentVisibilityState) => {
	Object.defineProperty(document, "visibilityState", {
		configurable: true,
		get: () => state,
	});
};

describe("WindowBackgroundObserver", () => {
	let observer: WindowBackgroundObserver;
	let changes: number;

	beforeEach(() => {
		setFocused(true);
		setVisibility("visible");
		observer = new WindowBackgroundObserver();
		changes = 0;
		observer.events.on("change", () => changes++);
	});

	afterEach(() => {
		observer.dispose();
	});

	it("counts a visible, focused page as being in the foreground", () => {
		expect(observer.isBackgrounded()).toBe(false);
	});

	it("counts a hidden page as backgrounded", () => {
		setVisibility("hidden");
		document.dispatchEvent(new Event("visibilitychange"));

		expect(observer.isBackgrounded()).toBe(true);
		expect(changes).toBe(1);
	});

	it("counts a visible page that lost focus as backgrounded", () => {
		setFocused(false);
		window.dispatchEvent(new Event("blur"));

		expect(observer.isBackgrounded()).toBe(true);
	});

	it("comes back to the foreground when both agree again", () => {
		setFocused(false);
		window.dispatchEvent(new Event("blur"));
		setFocused(true);
		window.dispatchEvent(new Event("focus"));

		expect(observer.isBackgrounded()).toBe(false);
		expect(changes).toBe(2);
	});

	it("says nothing when an event does not change the answer", () => {
		window.dispatchEvent(new Event("focus"));
		window.dispatchEvent(new Event("pageshow"));

		expect(changes).toBe(0);
	});

	it("stops listening once disposed", () => {
		observer.dispose();

		setFocused(false);
		window.dispatchEvent(new Event("blur"));

		expect(changes).toBe(0);
	});
});
