import { beforeEach, describe, expect, it } from "bun:test";
import { Duration } from "@webappwiz/time";
import { FakeClock } from "@webappwiz/time/testing";

import { MemoryStore, type RateLimit, RateLimiter } from "./index";

const LIMIT: RateLimit = { max: 3, window: Duration.mins(1) };

const from = (address: string) =>
	new Request("https://example.com/signup", {
		headers: { "x-forwarded-for": address },
	});

describe("RateLimiter", () => {
	let clock: FakeClock;
	let limiter: RateLimiter;

	beforeEach(() => {
		clock = new FakeClock();
		limiter = new RateLimiter(clock);
	});

	it("lets a client through up to the limit", async () => {
		expect(await limiter.hit(from("1.1.1.1"), "signup", LIMIT)).toBeNull();
		expect(await limiter.hit(from("1.1.1.1"), "signup", LIMIT)).toBeNull();
		expect(await limiter.hit(from("1.1.1.1"), "signup", LIMIT)).toBeNull();
	});

	it("turns down the request that goes over", async () => {
		for (let i = 0; i < 3; i++) {
			await limiter.hit(from("1.1.1.1"), "signup", LIMIT);
		}

		const retryAfter = await limiter.hit(from("1.1.1.1"), "signup", LIMIT);

		expect(retryAfter?.secs).toBe(60);
	});

	it("says how much of the window is left, not the whole of it", async () => {
		for (let i = 0; i < 3; i++) {
			await limiter.hit(from("1.1.1.1"), "signup", LIMIT);
		}
		clock.advance(Duration.secs(45));

		const retryAfter = await limiter.hit(from("1.1.1.1"), "signup", LIMIT);

		expect(retryAfter?.secs).toBe(15);
	});

	it("lets the client back in once the oldest hits slide out", async () => {
		for (let i = 0; i < 3; i++) {
			await limiter.hit(from("1.1.1.1"), "signup", LIMIT);
		}
		clock.advance(Duration.secs(61));

		expect(await limiter.hit(from("1.1.1.1"), "signup", LIMIT)).toBeNull();
	});

	it("counts each client separately", async () => {
		for (let i = 0; i < 3; i++) {
			await limiter.hit(from("1.1.1.1"), "signup", LIMIT);
		}

		expect(await limiter.hit(from("2.2.2.2"), "signup", LIMIT)).toBeNull();
	});

	it("counts each scope separately", async () => {
		for (let i = 0; i < 3; i++) {
			await limiter.hit(from("1.1.1.1"), "signup", LIMIT);
		}

		expect(await limiter.hit(from("1.1.1.1"), "login", LIMIT)).toBeNull();
	});

	it("takes the client from the front of a proxy chain, not the proxies", async () => {
		const chain = new Request("https://example.com/signup", {
			headers: { "x-forwarded-for": "1.1.1.1, 10.0.0.1, 10.0.0.2" },
		});

		for (let i = 0; i < 3; i++) {
			await limiter.hit(chain, "signup", LIMIT);
		}

		expect(await limiter.hit(from("1.1.1.1"), "signup", LIMIT)).not.toBeNull();
	});

	it("lets a request with no address through, since there is nothing to key on", async () => {
		const direct = new Request("https://example.com/signup");

		for (let i = 0; i < 5; i++) {
			expect(await limiter.hit(direct, "signup", LIMIT)).toBeNull();
		}
	});

	it("reads whichever header it was told to", async () => {
		const cloudflare = new RateLimiter(clock, {
			clientIpHeaders: ["cf-connecting-ip", "x-forwarded-for"],
		});
		const request = new Request("https://example.com/signup", {
			headers: { "cf-connecting-ip": "1.1.1.1" },
		});

		for (let i = 0; i < 3; i++) {
			await cloudflare.hit(request, "signup", LIMIT);
		}

		expect(await cloudflare.hit(request, "signup", LIMIT)).not.toBeNull();
	});

	it("keeps the hits in the store it was given", async () => {
		const store = new MemoryStore<string, number[]>(clock);
		const shared = new RateLimiter(clock, { store });

		await shared.hit(from("1.1.1.1"), "signup", LIMIT);

		expect(await store.get("signup:1.1.1.1")).toEqual([clock.now().ms]);
	});

	it("answers a turned down caller with a 429 saying when to come back", () => {
		const response = limiter.tooManyRequests(Duration.secs(14.2));

		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("15");
	});
});
