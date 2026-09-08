import type { StandardSchemaV1 } from "@standard-schema/spec";
import { SchemaError } from "webappwiz/t";
import { Binary, checkFile, mediaType } from "./binary";
import type { FileFields, FileResult, Output } from "./contract";

export const protocol = "x-webappwiz-rpc";
export function format(output: Output): "json" | "text" | "file" | "empty" {
	return "~standard" in output ? "json" : output.format;
}
export async function validate(
	schema: StandardSchemaV1,
	value: unknown,
): Promise<unknown> {
	const result = await schema["~standard"].validate(value);
	if (result.issues) {
		const issue = result.issues[0];
		throw new SchemaError(
			(issue?.path ?? []).map((segment) =>
				String(typeof segment === "object" ? segment.key : segment),
			),
			issue?.message ?? "invalid",
		);
	}
	return result.value;
}
export function checkFiles(
	fields: FileFields,
	value: unknown,
): Record<string, File | File[]> {
	if (!value || typeof value !== "object") {
		throw new Error("files: expected attachment map");
	}
	const files = value as Record<string, File | File[] | undefined>;
	const checked: Record<string, File | File[]> = Object.create(null);
	for (const key of Object.keys(files)) {
		if (!Object.hasOwn(fields, key)) {
			throw new Error(`files.${key}: unexpected attachment`);
		}
	}
	for (const [key, declaration] of Object.entries(fields)) {
		const rule = typeof declaration === "string" ? undefined : declaration;
		const kind = rule?.kind ?? declaration;
		const item = Object.hasOwn(files, key) ? files[key] : undefined;
		if (item === undefined && rule?.isOptional) {
			continue;
		}
		const path = `files.${key}`;
		if (kind === "file") {
			if (!(item instanceof File)) {
				throw new Error(`${path}: expected file`);
			}
			if (rule) {
				checkFile(rule, item, path);
			}
			checked[key] = item;
		} else {
			if (!Array.isArray(item)) {
				throw new Error(`${path}: expected files`);
			}
			const minCount = rule ? (rule.limits.minCount ?? 0) : 1;
			const maxCount = rule?.limits.maxCount ?? Infinity;
			if (item.length < minCount) {
				throw new Error(
					`${path}: minCount ${minCount}, received ${item.length}`,
				);
			}
			if (item.length > maxCount) {
				throw new Error(
					`${path}: maxCount ${maxCount}, received ${item.length}`,
				);
			}
			let total = 0;
			for (const [index, file] of item.entries()) {
				if (!(file instanceof File)) {
					throw new Error(`${path}[${index}]: expected file`);
				}
				if (rule) {
					checkFile(rule, file, `${path}[${index}]`);
				}
				total += file.size;
			}
			if (
				rule?.limits.maxTotalBytes !== undefined &&
				total > rule.limits.maxTotalBytes
			) {
				throw new Error(
					`${path}: maxTotalBytes ${rule.limits.maxTotalBytes}, received ${total}`,
				);
			}
			checked[key] = item;
		}
	}
	return checked;
}
export function json(value: unknown): string {
	const body = JSON.stringify(value);
	if (body === undefined) {
		throw new Error("expected JSON-serializable value");
	}
	return body;
}
export async function encode(
	output: Output,
	value: unknown,
	headers: Headers,
): Promise<Response> {
	if (value instanceof Response) {
		throw new Error("return the declared output, not a Response");
	}
	const kind = format(output);
	headers.set(protocol, `1:${kind}`);
	headers.delete("content-disposition");
	headers.delete("content-length");
	headers.delete("content-encoding");
	headers.delete("transfer-encoding");
	headers.delete("x-webappwiz-rpc-error");
	if (kind === "json") {
		const schema =
			"~standard" in output
				? output
				: (output as { schema: StandardSchemaV1 }).schema;
		await validate(schema, value);
		const body = json(value);
		await validate(
			"~standard" in output
				? output
				: (output as { schema: StandardSchemaV1 }).schema,
			JSON.parse(body),
		);
		headers.set("content-type", "application/json");
		return new Response(body, { headers });
	}
	if (kind === "text") {
		if (typeof value !== "string") {
			throw new Error("expected text output");
		}
		headers.set("content-type", "text/plain; charset=utf-8");
		return new Response(value, { headers });
	}
	if (kind === "empty") {
		if (value !== undefined) {
			throw new Error("expected undefined output");
		}
		headers.delete("content-type");
		return new Response(null, { status: 204, headers });
	}
	const file = (
		value instanceof File
			? { data: value, contentType: value.type, filename: value.name }
			: value
	) as FileResult | null;
	if (
		!file ||
		!(file.data instanceof Blob) ||
		typeof file.contentType !== "string" ||
		!mediaType(file.contentType)
	) {
		throw new Error("expected file output with Blob data and media type");
	}
	if (output instanceof Binary) {
		if (typeof file.filename !== "string" || !file.filename) {
			throw new Error("output: expected named file");
		}
		checkFile(
			output,
			{ size: file.data.size, type: file.contentType },
			"output",
		);
	}
	if (file.filename !== undefined) {
		if (
			typeof file.filename !== "string" ||
			!file.filename ||
			unsafeFilename(file.filename)
		) {
			throw new Error("invalid download filename");
		}
		headers.set(
			"content-disposition",
			`attachment; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,
		);
	}
	headers.set("content-type", file.contentType);
	return new Response(file.data, { headers });
}
export async function decode(output: Output, res: Response): Promise<unknown> {
	const kind = format(output);
	if (res.headers.get(protocol) !== `1:${kind}`) {
		throw new Error(`expected RPC v1 ${kind} response (deployment mismatch)`);
	}
	const contentType = res.headers.get("content-type") ?? "";
	const media = contentType.split(";")[0]?.trim().toLowerCase();
	if (kind === "empty") {
		if (
			res.status !== 204 ||
			contentType ||
			(await res.arrayBuffer()).byteLength
		) {
			throw new Error("expected empty 204 response");
		}
		return undefined;
	}
	if (res.status !== 200) {
		throw new Error(`unexpected success status ${res.status}`);
	}
	if (kind === "json") {
		if (media !== "application/json") {
			throw new Error("expected application/json");
		}
		return validate(
			"~standard" in output
				? output
				: (output as { schema: StandardSchemaV1 }).schema,
			await res.json(),
		);
	}
	if (kind === "text") {
		if (media !== "text/plain") {
			throw new Error("expected text/plain");
		}
		return res.text();
	}
	if (!mediaType(contentType)) {
		throw new Error("invalid file content-type");
	}
	const disposition = res.headers.get("content-disposition");
	let filename: string | undefined;
	if (disposition !== null) {
		const match = /^attachment; filename\*=UTF-8''([^\s;]*)$/i.exec(
			disposition,
		);
		if (!match) {
			throw new Error("invalid download disposition");
		}
		filename = decodeURIComponent(match[1] ?? "");
		if (!filename || unsafeFilename(filename)) {
			throw new Error("invalid download filename");
		}
	}
	const data =
		output instanceof Binary && output.limits.maxBytes !== undefined
			? await limitedBlob(res, output.limits.maxBytes)
			: await res.blob();
	if (output instanceof Binary) {
		if (filename === undefined) {
			throw new Error("output: expected download filename");
		}
		checkFile(output, { size: data.size, type: contentType }, "output");
	}
	return {
		data,
		contentType,
		...(filename === undefined ? {} : { filename }),
	};
}

function unsafeFilename(value: string): boolean {
	return [...value].some(
		(char) =>
			char.charCodeAt(0) < 32 ||
			char.charCodeAt(0) === 127 ||
			char === "/" ||
			char === "\\",
	);
}

/** Count actual download bytes rather than trusting a proxy's Content-Length. */
async function limitedBlob(res: Response, limit: number): Promise<Blob> {
	const reader = res.body?.getReader();
	const chunks: Uint8Array<ArrayBuffer>[] = [];
	let size = 0;
	if (reader) {
		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) {
					break;
				}
				size += value.byteLength;
				if (size > limit) {
					await reader.cancel();
					throw new Error(
						`output: maxBytes ${limit}, received at least ${size}`,
					);
				}
				chunks.push(value);
			}
		} finally {
			reader.releaseLock();
		}
	}
	return new Blob(chunks, { type: res.headers.get("content-type") ?? "" });
}
