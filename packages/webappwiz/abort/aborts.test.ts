import { describe, expect, it } from "bun:test";

import { aborts } from "./index";

describe("aborts", () => {
	it("settles with the promise when nothing aborts", async () => {
		const controller = new AbortController();
		await expect(
			aborts.race(controller.signal, Promise.resolve("done")),
		).resolves.toBe("done");
	});

	it("rejects with the reason when the signal wins", async () => {
		const controller = new AbortController();
		const pending = aborts.race(controller.signal, new Promise(() => {}));
		controller.abort(new Error("gave up"));
		await expect(pending).rejects.toThrow("gave up");
	});

	it("rejects straight away on a signal that has already aborted", async () => {
		const controller = new AbortController();
		controller.abort(new Error("too late"));
		await expect(
			aborts.race(controller.signal, Promise.resolve("done")),
		).rejects.toThrow("too late");
	});

	it("stops listening once the promise settles", async () => {
		const controller = new AbortController();
		await aborts.race(controller.signal, Promise.resolve("done"));

		// An abort after the race is over must not reject an already settled
		// promise, which would surface as an unhandled rejection.
		controller.abort(new Error("late"));
		await Promise.resolve();
	});
});
