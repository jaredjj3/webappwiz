import { describe, expect, it } from "bun:test";
import { t } from "webappwiz/t";
import {
	Binary,
	Client,
	type Contract,
	type Files,
	type Handlers,
	Service,
} from "./index";
import { checkFiles, decode, encode } from "./transport";

const wav = (size = 4, type = "audio/wav") =>
	new File([new Uint8Array(size)], "take.wav", { type, lastModified: 123 });
const base = Binary.file().audio();
const contract = {
	inspect: {
		type: "mutation",
		input: t.object({ title: t.string() }),
		files: {
			tracks: Binary.files({ minCount: 1, maxCount: 2 })
				.maxBytes(4)
				.maxTotalBytes(6)
				.audio(),
			reference: base.maxBytes(4).optional(),
		},
		output: Binary.file().maxKB(1).contentTypes("application/json"),
	},
	empty: {
		type: "mutation",
		input: t.object({}),
		files: { tracks: Binary.files() },
		output: t.number(),
	},
	optional: {
		type: "mutation",
		input: t.object({}),
		files: {
			tracks: Binary.files().optional(),
			reference: Binary.file().optional(),
		},
		output: t.object({ tracks: t.boolean(), reference: t.boolean() }),
	},
} satisfies Contract;
const handlers: Handlers<typeof contract> = {
	inspect: ({ title }, { files }) =>
		new File(
			[
				JSON.stringify({
					title,
					sizes: files.tracks.map((file) => file.size),
					reference: files.reference?.name ?? null,
				}),
			],
			"report.json",
			{ type: "application/json" },
		),
	empty: (_input, { files }) => files.tracks.length,
	optional: (_input, { files }) => ({
		tracks: files.tracks !== undefined,
		reference: files.reference !== undefined,
	}),
};

function multipart(
	files: Record<string, File | File[]>,
	input: unknown,
): FormData {
	const form = new FormData();
	const metadata: Record<
		string,
		{ name: string; type: string; lastModified: number }[]
	> = {};
	for (const [key, value] of Object.entries(files)) {
		const items = Array.isArray(value) ? value : [value];
		metadata[key] = items.map((file) => ({
			name: file.name,
			type: file.type,
			lastModified: file.lastModified,
		}));
		for (const item of items) {
			form.append(`file:${key}`, item);
		}
	}
	form.append("input", JSON.stringify({ input, metadata }));
	return form;
}

describe("Binary", () => {
	it("builds immutable reusable constraints with decimal sizes", () => {
		const limited = base.maxMB(25);
		expect(base.limits.maxBytes).toBeUndefined();
		expect(limited.limits.maxBytes).toBe(25_000_000);
		expect(base.maxKB(0.5).limits.maxBytes).toBe(500);
		expect(base.maxGB(1).limits.maxBytes).toBe(1_000_000_000);
		expect(Object.isFrozen(base)).toBe(true);
		expect(Object.isFrozen(base.limits.contentTypes)).toBe(true);
		const count = { maxCount: 2 };
		const collection = Binary.files(count);
		count.maxCount = 10;
		expect(collection.limits.maxCount).toBe(2);
		expect(collection.maxTotalMB(1).limits.maxTotalBytes).toBe(1_000_000);
	});
	it("rejects invalid builder configuration immediately", () => {
		for (const value of [
			-1,
			Infinity,
			Number.NaN,
			0.1,
			Number.MAX_SAFE_INTEGER + 1,
		]) {
			expect(() => Binary.file().maxBytes(value)).toThrow();
			expect(() => Binary.files({ maxCount: value })).toThrow();
		}
		expect(() => Binary.files({ minCount: 2, maxCount: 1 })).toThrow();
		expect(() => Binary.file().minBytes(2).maxBytes(1)).toThrow();
		expect(() => Binary.file().maxBytes(1).minBytes(2)).toThrow();
		expect(() => Binary.file().contentTypes()).toThrow();
		for (const type of [
			"audio",
			"*/wav",
			"audio/wav; charset=utf-8",
			"audio/\r\n",
		]) {
			expect(() => Binary.file().contentTypes(type)).toThrow();
		}
	});
	it("matches MIME families and aliases without guessing from filename", () => {
		for (const type of [
			"audio/wav",
			"audio/x-wav",
			"audio/wave",
			"audio/vnd.wave",
		]) {
			expect(() =>
				checkFiles(
					{ audio: Binary.file().contentTypes("AUDIO/WAV") },
					{ audio: wav(1, type) },
				),
			).not.toThrow();
		}
		expect(() =>
			checkFiles(
				{ video: Binary.file().video() },
				{ video: wav(1, "video/mp4") },
			),
		).not.toThrow();
		expect(() => checkFiles({ audio: base }, { audio: wav(1, "") })).toThrow(
			"received (empty)",
		);
		expect(() =>
			checkFiles({ audio: Binary.file() }, { audio: wav(0, "") }),
		).not.toThrow();
		expect(() =>
			checkFiles(
				{ audio: base.contentTypes("audio/wav") },
				{ audio: wav(1, "audio/mpeg") },
			),
		).toThrow("contentTypes audio/wav");
		expect(() =>
			checkFiles({ audio: Binary.file().minBytes(1) }, { audio: wav(0) }),
		).toThrow("minBytes 1");
	});
	it("round-trips a collection, optional fields, native File output and metadata", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: new Service(contract, handlers).fetch,
		});
		try {
			const client = new Client(contract, server.url.toString());
			const result = await client.call(
				"inspect",
				{ title: "takes" },
				{ files: { tracks: [wav(2), wav(4)] } },
			);
			expect(result.filename).toBe("report.json");
			expect(result.contentType.split(";")[0]).toBe("application/json");
			expect(JSON.parse(await result.data.text())).toEqual({
				title: "takes",
				sizes: [2, 4],
				reference: null,
			});
			const referenced = await client.call(
				"inspect",
				{ title: "one" },
				{ files: { tracks: [wav()], reference: wav() } },
			);
			expect(JSON.parse(await referenced.data.text()).reference).toBe(
				"take.wav",
			);
			expect(await client.call("empty", {}, { files: { tracks: [] } })).toBe(0);
			expect(await client.call("optional", {})).toEqual({
				tracks: false,
				reference: false,
			});
			expect(
				await client.call("optional", {}, { files: { tracks: [] } }),
			).toEqual({ tracks: true, reference: false });
		} finally {
			server.stop(true);
		}
	});
	it("enforces the same count, size, total and MIME constraints locally and on the server", async () => {
		const service = new Service(contract, handlers);
		const server = Bun.serve({ port: 0, fetch: service.fetch });
		try {
			const client = new Client(contract, server.url.toString());
			for (const [tracks, message] of [
				[[], "files.tracks: minCount 1"],
				[[wav(1), wav(1), wav(1)], "files.tracks: maxCount 2"],
				[[wav(5)], "files.tracks[0]: maxBytes 4"],
				[[wav(4), wav(4)], "files.tracks: maxTotalBytes 6"],
				[
					[wav(1), wav(1, "video/mp4")],
					"files.tracks[1]: contentTypes audio/*",
				],
			] as [File[], string][]) {
				await expect(
					client.call("inspect", { title: "test" }, { files: { tracks } }),
				).rejects.toMatchObject({
					status: 0,
					code: "request_invalid",
					message: expect.stringContaining(message),
				});
				const response = await service.fetch(
					new Request("http://test/inspect", {
						method: "POST",
						body: multipart({ tracks }, { title: "test" }),
					}),
				);
				expect(response.status).toBe(400);
				expect(await response.text()).toContain(message);
			}
		} finally {
			server.stop(true);
		}
	});
	it("validates declared file responses on both sides", async () => {
		const output = Binary.file().maxBytes(4).audio();
		const result = await decode(
			output,
			await encode(output, wav(), new Headers()),
		);
		expect(result).toMatchObject({
			filename: "take.wav",
			contentType: "audio/wav",
		});
		await expect(encode(output, wav(5), new Headers())).rejects.toThrow(
			"output: maxBytes 4",
		);
		await expect(
			encode(output, wav(1, "video/mp4"), new Headers()),
		).rejects.toThrow("output: contentTypes audio/*");
		await expect(
			encode(output, { data: wav(), contentType: "audio/wav" }, new Headers()),
		).rejects.toThrow("expected named file");
		for (const [body, headers, message] of [
			[
				"12345",
				{
					"content-type": "audio/wav",
					"content-disposition": "attachment; filename*=UTF-8''take.wav",
				},
				"maxBytes 4",
			],
			[
				"123",
				{
					"content-type": "video/mp4",
					"content-disposition": "attachment; filename*=UTF-8''take.wav",
				},
				"contentTypes audio/*",
			],
			["123", { "content-type": "audio/wav" }, "expected download filename"],
		] as [string, Record<string, string>, string][]) {
			await expect(
				decode(
					output,
					new Response(body, {
						headers: { ...headers, "x-webappwiz-rpc": "1:file" },
					}),
				),
			).rejects.toThrow(message);
		}
	});
	it("enforces inferred types and keeps collection responses unsupported", () => {
		const client = new Client(contract, "http://test");
		const check = async () => {
			// @ts-expect-error required collection cannot be omitted
			await client.call("empty", {});
			// @ts-expect-error collection must be an array
			await client.call("empty", {}, { files: { tracks: wav() } });
			// @ts-expect-error optional file must still be a File
			await client.call("optional", {}, { files: { reference: "wrong" } });
			new Service(contract, {
				...handlers,
				// @ts-expect-error file response requires a filename
				inspect: () => ({ data: wav(), contentType: "audio/wav" }),
			});
			// @ts-expect-error aggregate constraints are only for collections
			Binary.file().maxTotalMB(1);
			const invalid: Contract = {
				collection: {
					type: "query",
					input: t.object({}),
					// @ts-expect-error no collection response transport
					output: Binary.files(),
				},
				optional: {
					type: "query",
					input: t.object({}),
					// @ts-expect-error optional responses must use an explicit response format
					output: Binary.file().optional(),
				},
			};
			const files: Files<typeof contract.inspect> = { tracks: [wav()] };
			const optional: File | undefined = files.reference;
			return { invalid, optional };
		};
		expect(check).toBeInstanceOf(Function);
	});
});

it("runs the documented contract, client and server example end to end", async () => {
	const { service } = await import("./examples/server");
	const { uploadAudio } = await import("./examples/client");
	const server = Bun.serve({ port: 0, fetch: service.fetch });
	try {
		const report = await uploadAudio(server.url.toString(), "Session", [
			new File(["abc"], "take.wav", { type: "audio/wav" }),
		]);
		expect(report.filename).toBe("audio-report.json");
		expect(JSON.parse(await report.data.text())).toEqual({
			title: "Session",
			audio: [
				{
					name: "take.wav",
					contentType: "audio/wav",
					bytes: 3,
					sha256:
						"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
				},
			],
		});
	} finally {
		server.stop(true);
	}
});

it("cancels oversized downloads even without Content-Length", async () => {
	let cancelled = false;
	const body = new ReadableStream({
		pull(controller) {
			controller.enqueue(new Uint8Array(5));
		},
		cancel() {
			cancelled = true;
		},
	});
	await expect(
		decode(
			Binary.file().maxBytes(4),
			new Response(body, {
				headers: {
					"x-webappwiz-rpc": "1:file",
					"content-type": "audio/wav",
					"content-disposition": "attachment; filename*=UTF-8''test.wav",
				},
			}),
		),
	).rejects.toThrow("output: maxBytes 4");
	expect(cancelled).toBe(true);
});

it("maps binary output violations to output_invalid and response_invalid", async () => {
	const declaration = {
		read: {
			type: "query",
			input: t.object({}),
			output: Binary.file().audio().maxBytes(2),
		},
	} satisfies Contract;
	const service = new Service(declaration, { read: () => wav(3) });
	const server = Bun.serve({ port: 0, fetch: service.fetch });
	try {
		await expect(
			new Client(declaration, server.url.toString()).call("read", {}),
		).rejects.toMatchObject({ code: "output_invalid", status: 500 });
	} finally {
		server.stop(true);
	}
	const incompatible = Bun.serve({
		port: 0,
		fetch: () =>
			new Response("123", {
				headers: {
					"x-webappwiz-rpc": "1:file",
					"content-type": "audio/wav",
					"content-disposition": "attachment; filename*=UTF-8''test.wav",
				},
			}),
	});
	try {
		await expect(
			new Client(declaration, incompatible.url.toString()).call("read", {}),
		).rejects.toMatchObject({ code: "response_invalid", status: 200 });
	} finally {
		incompatible.stop(true);
	}
});
