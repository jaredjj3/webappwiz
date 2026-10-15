import { beforeEach, describe, expect, it } from "bun:test";
import { FakeWallClock } from "webappwiz/time/testing";
import { base64url, bytesOf } from "./base64url";
import { PushFailure } from "./push-failure";
import type { Subscription } from "./pusher";
import { generateVapidKeys, type VapidKeys } from "./vapid";
import { WebPusher } from "./web-pusher";

describe("WebPusher", () => {
	let keys: VapidKeys;
	let subscription: Subscription;
	let clock: FakeWallClock;
	let seen: { url: string; headers: Headers; body: Uint8Array } | undefined;
	let status: number;
	let pusher: WebPusher;

	beforeEach(async () => {
		keys = await generateVapidKeys();
		const browser = await crypto.subtle.generateKey(
			{ name: "ECDH", namedCurve: "P-256" },
			true,
			["deriveBits"],
		);
		subscription = {
			endpoint: "https://web.push.apple.com/QGfx0abc",
			keys: {
				p256dh: base64url(
					new Uint8Array(
						await crypto.subtle.exportKey("raw", browser.publicKey),
					),
				),
				auth: base64url(crypto.getRandomValues(new Uint8Array(16))),
			},
		};
		clock = new FakeWallClock(Date.parse("2026-10-15T12:00:00Z"));
		seen = undefined;
		status = 201;
		const fetcher = (async (url: string, init: RequestInit) => {
			seen = {
				url,
				headers: new Headers(init.headers),
				body: init.body as Uint8Array,
			};
			return new Response(status === 201 ? null : "nope", { status });
		}) as unknown as typeof fetch;
		pusher = new WebPusher(keys, "https://example.com", {
			fetch: fetcher,
			clock,
		});
	});

	it("posts an encrypted body to the endpoint", async () => {
		await pusher.push(subscription, "hello", { urgency: "high", topic: "t1" });

		expect(seen?.url).toBe(subscription.endpoint);
		expect(seen?.headers.get("content-encoding")).toBe("aes128gcm");
		expect(seen?.headers.get("ttl")).toBe("86400");
		expect(seen?.headers.get("urgency")).toBe("high");
		expect(seen?.headers.get("topic")).toBe("t1");
		// salt, record size, key length, key, then the sealed "hello" + 2 + tag
		expect(seen?.body.length).toBe(16 + 4 + 1 + 65 + 5 + 1 + 16);
	});

	it("signs a JWT for the endpoint's origin with the public key named", async () => {
		await pusher.push(subscription, "hello");

		const match = /^vapid t=([^,]+), k=(.+)$/.exec(
			seen?.headers.get("authorization") ?? "",
		);
		expect(match?.[2]).toBe(keys.publicKey);
		const [header, claims, signature] = (match?.[1] ?? "").split(".");
		expect(JSON.parse(new TextDecoder().decode(bytesOf(claims ?? "")))).toEqual(
			{
				aud: "https://web.push.apple.com",
				exp: Math.floor(clock.now() / 1000) + 12 * 60 * 60,
				sub: "https://example.com",
			},
		);
		const verifier = await crypto.subtle.importKey(
			"raw",
			bytesOf(keys.publicKey),
			{ name: "ECDSA", namedCurve: "P-256" },
			false,
			["verify"],
		);
		expect(
			await crypto.subtle.verify(
				{ name: "ECDSA", hash: "SHA-256" },
				verifier,
				bytesOf(signature ?? ""),
				new TextEncoder().encode(`${header}.${claims}`),
			),
		).toBe(true);
	});

	it("fails with the status, saying when the subscription is gone", async () => {
		status = 410;

		const failure = await pusher.push(subscription, "hello").then(
			() => null,
			(error: PushFailure) => error,
		);

		expect(failure).toBeInstanceOf(PushFailure);
		expect(failure?.status).toBe(410);
		expect(failure?.gone).toBe(true);
	});
});
