import type { StandardSchemaV1 } from "@standard-schema/spec";
import { SchemaError } from "webappwiz/t";
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
	const files = value as Record<string, File | File[]>;
	for (const key of Object.keys(files)) {
		if (!Object.hasOwn(fields, key)) {
			throw new Error(`files.${key}: unexpected attachment`);
		}
	}
	for (const [key, kind] of Object.entries(fields)) {
		const item = files[key];
		if (
			kind === "file"
				? !(item instanceof File)
				: !Array.isArray(item) ||
					item.length === 0 ||
					!item.every((file) => file instanceof File)
		) {
			throw new Error(`files.${key}: expected ${kind}`);
		}
	}
	return files;
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
	const file = value as FileResult | null;
	if (
		!file ||
		!(file.data instanceof Blob) ||
		typeof file.contentType !== "string" ||
		!/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(file.contentType)
	) {
		throw new Error("expected file output with Blob data and media type");
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
	if (!/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(contentType)) {
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
	return {
		data: await res.blob(),
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
