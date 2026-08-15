import "../../test-setup";
import { beforeEach, describe, expect, it } from "bun:test";
import { Duration } from "@webappwiz/time";
import { FakeClock } from "@webappwiz/time/testing";

import { AnimationLoop } from "./index";

/** Lets however many animation frames are queued run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

describe("AnimationLoop", () => {
	let clock: FakeClock;
	let loop: AnimationLoop;

	beforeEach(() => {
		clock = new FakeClock();
		loop = new AnimationLoop(clock);
	});

	it("raises nothing until it is started", async () => {
		let frames = 0;
		loop.events.on("frame", () => frames++);

		await settle();

		expect(frames).toBe(0);
		expect(loop.isRunning()).toBe(false);
	});

	it("keeps raising frames once started", async () => {
		let frames = 0;
		loop.events.on("frame", () => frames++);

		loop.start();
		await settle();
		loop.stop();

		expect(frames).toBeGreaterThan(1);
	});

	it("says how long it has been since the last frame", async () => {
		const gaps: number[] = [];
		loop.events.on("frame", ({ dt }) => {
			gaps.push(dt.ms);
			clock.advance(Duration.ms(16));
		});

		loop.start();
		await settle();
		loop.stop();

		expect(gaps.length).toBeGreaterThan(0);
	});

	it("raises no more frames after being stopped", async () => {
		let frames = 0;
		loop.events.on("frame", () => frames++);

		loop.start();
		await settle();
		loop.stop();
		const stoppedAt = frames;

		await settle();
		expect(frames).toBe(stoppedAt);
	});

	it("stops when disposed", async () => {
		let frames = 0;
		loop.events.on("frame", () => frames++);

		loop.start();
		loop.dispose();
		await settle();

		expect(loop.isRunning()).toBe(false);
		expect(frames).toBe(0);
	});
});
