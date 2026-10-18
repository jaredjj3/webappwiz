import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	CredentialProxy,
	type CredentialProxyOptions,
} from "./credential-proxy";
import { MemorySecretStore } from "./memory-secret-store";

const KEY = "sk-real-key-0123456789";

describe("CredentialProxy", () => {
	let upstream: FakeUpstream;
	let store: MemorySecretStore;
	let proxies: CredentialProxy[];
	let proxy: CredentialProxy;

	beforeEach(async () => {
		upstream = new FakeUpstream();
		store = new MemorySecretStore();
		await store.set("API_KEY", KEY);
		proxies = [];
		proxy = listen();
	});

	afterEach(async () => {
		await Promise.all(proxies.map((each) => each.disposeAsync()));
		await upstream.server.stop(true);
	});

	function listen(opts: Partial<CredentialProxyOptions> = {}): CredentialProxy {
		const made = CredentialProxy.listen(store, {
			upstream: upstream.url,
			credential: "API_KEY",
			header: "x-api-key",
			...opts,
		});
		proxies.push(made);
		return made;
	}

	/** A request to `proxy` carrying its placeholder, as its agent sends one. */
	function ask(path: string, init: RequestInit = {}): Promise<Response> {
		return fetch(`${proxy.url}${path}`, {
			...init,
			headers: { "x-api-key": proxy.placeholder, ...init.headers },
		});
	}

	it("forwards a request with the real key in place of the placeholder", async () => {
		proxy = listen({ upstream: `${upstream.url}/v1/` });

		const response = await ask("/messages?beta=true", {
			method: "POST",
			headers: { "x-extra": "kept" },
			body: '{"model":"m"}',
		});

		expect(response.status).toEqual(200);
		expect(await response.text()).toEqual("ok");
		expect(upstream.seen()).toEqual([
			{
				url: `${upstream.url}/v1/messages?beta=true`,
				key: KEY,
				extra: "kept",
				body: '{"model":"m"}',
			},
		]);
	});

	it("puts the key after the scheme it was given", async () => {
		const bearer = listen({ header: "Authorization", scheme: "Bearer" });

		const response = await fetch(`${bearer.url}/responses`, {
			headers: { authorization: `Bearer ${bearer.placeholder}` },
		});

		expect(response.status).toEqual(200);
		expect(upstream.requests[0]?.headers.get("authorization")).toEqual(
			`Bearer ${KEY}`,
		);
	});

	it("listens on loopback alone", () => {
		expect(proxy.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
	});

	it.each<[string, (placeholder: string) => Record<string, string>]>([
		["no key", () => ({})],
		["a wrong key", () => ({ "x-api-key": "wiz-proxy-guess" })],
		["the real key", () => ({ "x-api-key": KEY })],
		[
			"its placeholder in another header",
			(placeholder) => ({ authorization: `Bearer ${placeholder}` }),
		],
	])("refuses a request with %s, reaching no upstream", async (_, headers) => {
		const response = await fetch(`${proxy.url}/messages`, {
			headers: headers(proxy.placeholder),
		});

		expect(response.status).toEqual(401);
		expect(upstream.requests).toEqual([]);
	});

	it("refuses another proxy's placeholder", async () => {
		const theirs = listen();

		const response = await fetch(`${proxy.url}/messages`, {
			headers: { "x-api-key": theirs.placeholder },
		});

		expect(proxy.placeholder).not.toEqual(theirs.placeholder);
		expect(response.status).toEqual(401);
		expect(upstream.requests).toEqual([]);
	});

	it("reads the key on every request, so a rotated one needs no restart", async () => {
		await ask("/a");
		await store.set("API_KEY", "sk-rotated");
		await ask("/b");

		expect(upstream.seen().map((seen) => seen.key)).toEqual([
			KEY,
			"sk-rotated",
		]);
	});

	it("answers 503, reaching no upstream, once the key is gone", async () => {
		store.clear();

		const response = await ask("/messages");

		expect(response.status).toEqual(503);
		expect(await response.text()).toEqual(
			"API_KEY is not available to this proxy\n",
		);
		expect(upstream.requests).toEqual([]);
	});

	it.each(["//evil.example/steal", "http://evil.example/steal"])(
		"keeps a request for %s on the upstream",
		async (target) => {
			// a raw request, since fetch would tidy the path before sending it
			const socket = await Bun.connect({
				hostname: "127.0.0.1",
				port: Number(new URL(proxy.url).port),
				socket: { data: () => {} },
			});
			socket.write(
				`GET ${target} HTTP/1.1\r\nhost: evil.example\r\nx-api-key: ${proxy.placeholder}\r\nconnection: close\r\n\r\n`,
			);
			const arrived = await upstream.arrived;
			socket.end();

			expect(new URL(arrived.url).host).toEqual(new URL(upstream.url).host);
			expect(arrived.url).toEndWith("/steal");
		},
	);

	it("hands a redirect back rather than following it with the key", async () => {
		upstream.respond = () =>
			Response.redirect("https://elsewhere.example/", 302);

		const response = await ask("/messages", { redirect: "manual" });

		expect(response.status).toEqual(302);
		expect(response.headers.get("location")).toEqual(
			"https://elsewhere.example/",
		);
		expect(upstream.requests.length).toEqual(1);
	});

	it("streams server-sent events through as they come", async () => {
		const release = upstream.respondWithEvents(
			"data: one\n\n",
			"data: two\n\n",
		);

		const response = await ask("/messages");
		const events = response.body?.pipeThrough(new TextDecoderStream());
		const reader = events?.getReader();
		const first = await reader?.read();
		release();
		const second = await reader?.read();

		expect(response.headers.get("content-type")).toEqual("text/event-stream");
		expect([first?.value, second?.value]).toEqual([
			"data: one\n\n",
			"data: two\n\n",
		]);
	});

	it("passes a compressed body through as it came", async () => {
		upstream.respond = () =>
			new Response(Bun.gzipSync("a compressed answer"), {
				headers: { "content-encoding": "gzip" },
			});

		const response = await ask("/messages");

		expect(response.headers.get("content-encoding")).toEqual("gzip");
		expect(await response.text()).toEqual("a compressed answer");
	});

	it("refuses an upstream that would carry the key in the clear", () => {
		expect(() => listen({ upstream: "http://api.example.com" })).toThrow(
			"is not https",
		);
	});

	it("answers 502 when the upstream cannot be reached", async () => {
		await upstream.server.stop(true);

		const response = await ask("/messages");

		expect(response.status).toEqual(502);
	});

	it("never shows the key in its placeholder, its answers or itself", async () => {
		const refused = await fetch(`${proxy.url}/messages`);
		await upstream.server.stop(true);
		const unreachable = await ask("/messages");

		const shown = [
			proxy.placeholder,
			proxy.url,
			await refused.text(),
			await unreachable.text(),
			Bun.inspect(proxy),
		].join("\n");

		expect(shown).not.toContain(KEY);
	});

	it("stops listening once disposed", async () => {
		await proxy.disposeAsync();

		await expect(ask("/messages")).rejects.toThrow();
	});
});

/** A loopback upstream that records each request it gets and answers with `respond`. */
class FakeUpstream {
	readonly requests: { url: string; headers: Headers; body: string }[] = [];
	respond: (request: Request) => Response = () => new Response("ok");
	private readonly first = Promise.withResolvers<{ url: string }>();
	/** The first request it got, once it has one. */
	readonly arrived = this.first.promise;
	readonly server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: async (request) => {
			this.requests.push({
				url: request.url,
				headers: request.headers,
				body: await request.text(),
			});
			this.first.resolve({ url: request.url });
			return this.respond(request);
		},
	});
	readonly url = `http://127.0.0.1:${this.server.port}`;

	/**
	 * Answers with server-sent events: `first` at once, `second` only once
	 * the returned function is called, to show the first went through alone.
	 */
	respondWithEvents(first: string, second: string): () => void {
		const { promise, resolve } = Promise.withResolvers<void>();
		const encoder = new TextEncoder();
		this.respond = () =>
			new Response(
				new ReadableStream({
					async start(controller) {
						controller.enqueue(encoder.encode(first));
						await promise;
						controller.enqueue(encoder.encode(second));
						controller.close();
					},
				}),
				{ headers: { "content-type": "text/event-stream" } },
			);
		return resolve;
	}

	/** What each request asked for, and the key it carried. */
	seen() {
		return this.requests.map(({ url, headers, body }) => ({
			url,
			key: headers.get("x-api-key"),
			extra: headers.get("x-extra") ?? undefined,
			body,
		}));
	}
}
