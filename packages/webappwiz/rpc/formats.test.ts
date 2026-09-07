import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { t } from "webappwiz/t";
import { z } from "zod";
import {
	Client,
	type Contract,
	type Handlers,
	RpcError,
	Service,
} from "./index";

const contract = {
	upload: {
		type: "mutation",
		input: z.object({ gain: z.number() }),
		files: { audio: "file", extras: "files" },
		output: z.object({
			bytes: z.array(z.number()),
			name: z.string(),
			type: z.string(),
			modified: z.number(),
			count: z.number(),
			gain: z.number(),
		}),
	},
	text: { type: "query", input: z.object({}), output: { format: "text" } },
	file: {
		type: "mutation",
		input: z.object({ fail: z.boolean() }),
		output: { format: "file" },
	},
	empty: { type: "mutation", input: z.object({}), output: { format: "empty" } },
	transform: {
		type: "mutation",
		input: z.string().transform(async (value) => value.length),
		output: {
			format: "json",
			schema: z.string().transform(async (value) => value.length),
		},
	},
} satisfies Contract;
const handlers: Handlers<typeof contract> = {
	upload: async ({ gain }, { files }) => ({
		bytes: [...new Uint8Array(await files.audio.arrayBuffer())],
		name: files.audio.name,
		type: files.audio.type,
		modified: files.audio.lastModified,
		count: files.extras.length,
		gain,
	}),
	text: () => "score ♫\nready",
	file: ({ fail }) => {
		if (fail) {
			throw new RpcError(409, "not ready");
		}
		return {
			data: new Blob([new Uint8Array([0, 255, 128, 13, 10])]),
			contentType: "application/octet-stream",
			filename: "résultat '♫'.mid",
		};
	},
	empty: () => undefined,
	transform: (length) => "x".repeat(length),
};
const meta = { name: "audio.wav", type: "audio/wav", lastModified: 123456 };
const audio = new File([new Uint8Array([0, 255, 1, 128])], "audio.wav", {
	type: "audio/wav",
	lastModified: 123456,
});

describe("RPC formats", () => {
	let server: ReturnType<typeof Bun.serve>;
	let client: Client<typeof contract>;
	beforeAll(() => {
		const service = new Service(contract, handlers, { cors: "*" });
		server = Bun.serve({ port: 0, fetch: service.fetch });
		client = new Client(contract, server.url.toString(), {
			headers: { "content-type": "incorrect" },
		});
	});
	afterAll(() => server.stop(true));
	it("uploads binary files, metadata, repeated attachments and typed options", async () => {
		expect(
			await client.call(
				"upload",
				{ gain: 2 },
				{ files: { audio, extras: [audio, audio] } },
			),
		).toEqual({
			bytes: [0, 255, 1, 128],
			name: "audio.wav",
			type: "audio/wav",
			modified: 123456,
			count: 2,
			gain: 2,
		});
	});
	it("round-trips text, empty and async transforming schemas", async () => {
		expect(await client.call("text", {})).toBe("score ♫\nready");
		expect(await client.call("empty", {})).toBeUndefined();
		expect(await client.call("transform", "hello")).toBe(5);
	});
	it("downloads exact bytes and Unicode filenames, with exposed CORS metadata", async () => {
		let exposed = "";
		client.events.on("response", (response) => {
			exposed = response.headers.get("access-control-expose-headers") ?? "";
		});
		const result = await client.call("file", { fail: false });
		expect([...new Uint8Array(await result.data.arrayBuffer())]).toEqual([
			0, 255, 128, 13, 10,
		]);
		expect(result.filename).toBe("résultat '♫'.mid");
		expect(result.contentType).toBe("application/octet-stream");
		expect(exposed).toContain("content-disposition");
		expect(exposed).toContain("x-webappwiz-rpc");
	});
	it("never returns a failed download as a file", async () => {
		expect(client.call("file", { fail: true })).rejects.toMatchObject({
			status: 409,
			code: "handler_error",
			message: "file: not ready",
		});
	});
	it("rejects invalid client values and attachment maps", async () => {
		await expect(
			client.call(
				"upload",
				// @ts-expect-error wrong structured input
				{ gain: "bad" },
				{ files: { audio, extras: [audio] } },
			),
		).rejects.toMatchObject({ code: "request_invalid", status: 0 });
		await expect(
			client.call("upload", { gain: 1 }, { files: { audio, extras: [] } }),
		).rejects.toMatchObject({ code: "request_invalid" });
	});
});

it("rejects malformed multipart, missing, duplicate and unexpected parts", async () => {
	const service = new Service(contract, handlers);
	for (const mode of [
		"missing",
		"duplicate",
		"unexpected",
		"string",
		"bad-input",
		"metadata",
	]) {
		const form = new FormData();
		form.append(
			"input",
			JSON.stringify({
				input: { gain: mode === "bad-input" ? "bad" : 1 },
				metadata: {
					audio:
						mode === "metadata"
							? ["bad"]
							: mode === "duplicate"
								? [meta, meta]
								: [meta],
					extras: [meta],
				},
			}),
		);
		if (mode !== "missing") {
			form.append("file:audio", mode === "string" ? "oops" : audio);
		}
		if (mode === "duplicate") {
			form.append("file:audio", audio);
		}
		if (mode === "unexpected") {
			form.append("surprise", audio);
		}
		form.append("file:extras", audio);
		const response = await service.fetch(
			new Request("http://test/upload", { method: "POST", body: form }),
		);
		expect(response.status).toBe(400);
		expect(response.headers.get("x-webappwiz-rpc-error")).toBe(
			"request_invalid",
		);
	}
	const broken = await service.fetch(
		new Request("http://test/upload", {
			method: "POST",
			body: "not multipart",
			headers: { "content-type": "multipart/form-data; boundary=x" },
		}),
	);
	expect(broken.status).toBe(400);
});

it("bounds request buffering even without Content-Length", async () => {
	const service = new Service(contract, handlers, { maxRequestBytes: 8 });
	let cancelled = false;
	const body = new ReadableStream({
		pull(controller) {
			controller.enqueue(new Uint8Array(9));
		},
		cancel() {
			cancelled = true;
		},
	});
	const response = await service.fetch(
		new Request("http://test/empty", { method: "POST", body }),
	);
	expect(response.status).toBe(413);
	expect(response.headers.get("x-webappwiz-rpc-error")).toBe(
		"request_too_large",
	);
	expect(cancelled).toBe(true);
});

it("rejects invalid handler outputs in every format without exposing values", async () => {
	for (const [name, output] of [
		["upload", {}],
		["text", 12],
		["file", { data: "bad" }],
		[
			"file",
			{ data: new Blob(), contentType: "audio/wav", filename: "bad\r\nname" },
		],
		["empty", "body"],
		["text", new Response("escape")],
	] as const) {
		const badHandlers = {
			...handlers,
			[name]: () => output,
		} as unknown as Handlers<typeof contract>;
		const service = new Service(contract, badHandlers);
		const request =
			name === "upload"
				? (() => {
						const form = new FormData();
						form.append(
							"input",
							JSON.stringify({
								input: { gain: 1 },
								metadata: { audio: [meta], extras: [meta] },
							}),
						);
						form.append("file:audio", audio);
						form.append("file:extras", audio);
						return new Request("http://test/upload", {
							method: "POST",
							body: form,
						});
					})()
				: new Request(
						`http://test/${name}${name === "text" ? "?input={}" : ""}`,
						name === "text"
							? {}
							: {
									method: "POST",
									body: JSON.stringify(name === "file" ? { fail: false } : {}),
								},
					);
		const response = await service.fetch(request);
		expect({
			status: response.status,
			body: await response.clone().text(),
		}).toEqual({ status: 500, body: "invalid handler output" });
		expect(response.headers.get("x-webappwiz-rpc-error")).toBe(
			"output_invalid",
		);
		expect(await response.text()).toBe("invalid handler output");
	}
});

it("rejects incompatible server responses before exposing results", async () => {
	const cases = [
		{ name: "text", response: () => new Response("legacy") },
		{
			name: "text",
			response: () =>
				new Response("{}", {
					headers: {
						"x-webappwiz-rpc": "1:json",
						"content-type": "application/json",
					},
				}),
		},
		{
			name: "text",
			response: () =>
				new Response("bad", {
					headers: { "x-webappwiz-rpc": "1:text", "content-type": "text/html" },
				}),
		},
		{
			name: "upload",
			response: () =>
				Response.json(
					{ bad: true },
					{ headers: { "x-webappwiz-rpc": "1:json" } },
				),
		},
		{
			name: "upload",
			response: () =>
				new Response("{broken", {
					headers: {
						"x-webappwiz-rpc": "1:json",
						"content-type": "application/json",
					},
				}),
		},
		{ name: "file", response: () => new Response("error", { status: 500 }) },
		{
			name: "file",
			response: () =>
				new Response("error", { headers: { "x-webappwiz-rpc": "1:error" } }),
		},
		{
			name: "file",
			response: () =>
				new Response("bytes", {
					headers: {
						"x-webappwiz-rpc": "1:file",
						"content-type": "audio/wav",
						"content-disposition": "attachment; filename*=UTF-8''%ZZ",
					},
				}),
		},
		{
			name: "empty",
			response: () =>
				new Response("unexpected", {
					headers: { "x-webappwiz-rpc": "1:empty" },
				}),
		},
	] as const;
	for (const test of cases) {
		const server = Bun.serve({ port: 0, fetch: test.response });
		try {
			const client = new Client(contract, server.url.toString());
			const result =
				test.name === "upload"
					? client.call(
							"upload",
							{ gain: 1 },
							{ files: { audio, extras: [audio] } },
						)
					: test.name === "file"
						? client.call("file", { fail: false })
						: client.call(test.name, {});
			await expect(result).rejects.toMatchObject({ code: "response_invalid" });
		} finally {
			server.stop(true);
		}
	}
});

it("enforces contract signatures at compile time", () => {
	const client = new Client(contract, "http://test");
	const check = async () => {
		// @ts-expect-error missing handlers
		new Service(contract, { text: () => "ok" });
		// @ts-expect-error wrong text return type
		new Service(contract, { ...handlers, text: () => 12 });
		// @ts-expect-error arbitrary Response is not a file result
		new Service(contract, { ...handlers, file: () => new Response() });
		// @ts-expect-error missing files argument
		await client.call("upload", { gain: 1 });
		// @ts-expect-error missing required audio attachment
		await client.call("upload", { gain: 1 }, { files: { extras: [audio] } });
		await client.call(
			"upload",
			{ gain: 1 },
			// @ts-expect-error wrong attachment type
			{ files: { audio: "oops", extras: [audio] } },
		);
		// @ts-expect-error no files on JSON-only operation
		await client.call("empty", {}, { files: { audio } });
		// @ts-expect-error output schema requires a string before transformation
		new Service(contract, { ...handlers, transform: () => 1 });
		// @ts-expect-error unknown operation
		await client.call("absent", {});
		const text: string = await client.call("text", {});
		const empty: undefined = await client.call("empty", {});
		const transformed: number = await client.call("transform", "abc");
		return { text, empty, transformed };
	};
	expect(check).toBeInstanceOf(Function);
	expect(() => new Service(contract, {} as Handlers<typeof contract>)).toThrow(
		"missing RPC handler",
	);
});

it("retains strict built-in schema returns and rejects query attachments", () => {
	const typed = {
		read: {
			type: "query",
			input: t.object({ id: t.number() }),
			output: t.object({ title: t.string() }),
		},
	} satisfies Contract;
	const check = () => {
		// @ts-expect-error built-in schema handler return must match output
		new Service(typed, { read: () => ({ title: 123 }) });
		const invalid: Contract = {
			// @ts-expect-error queries cannot declare attachments
			read: { ...typed.read, files: { audio: "file" } },
		};
		return invalid;
	};
	expect(check).toBeInstanceOf(Function);
});

it("rejects invalid raw JSON values even when serialization would conceal them", async () => {
	const typed = {
		value: {
			type: "mutation",
			input: z.number().nullable(),
			output: z.number().nullable(),
		},
	} satisfies Contract;
	const service = new Service(typed, { value: () => Number.NaN });
	const server = Bun.serve({ port: 0, fetch: service.fetch });
	try {
		const client = new Client(typed, server.url.toString());
		await expect(client.call("value", Number.NaN)).rejects.toMatchObject({
			code: "request_invalid",
		});
		await expect(client.call("value", 1)).rejects.toMatchObject({
			code: "output_invalid",
		});
	} finally {
		server.stop(true);
	}
});

it("keeps a file response distinct from JSON and text even with those media types", async () => {
	for (const contentType of [
		"application/json",
		"text/plain",
		"application/octet-stream",
	]) {
		const typed = {
			file: { type: "query", input: z.object({}), output: { format: "file" } },
		} satisfies Contract;
		const service = new Service(typed, {
			file: (_input, ctx) => {
				ctx.headers.set("content-type", "wrong");
				ctx.headers.set("content-disposition", "wrong");
				ctx.headers.set("x-webappwiz-rpc", "1:error");
				return { data: new Blob(), contentType };
			},
		});
		const server = Bun.serve({ port: 0, fetch: service.fetch });
		try {
			const result = await new Client(typed, server.url.toString()).call(
				"file",
				{},
			);
			expect(result.data.size).toBe(0);
			expect(result.filename).toBeUndefined();
			expect(result.contentType).toBe(contentType);
		} finally {
			server.stop(true);
		}
	}
});
