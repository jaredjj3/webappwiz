/** Counts constrain a collection, while chained size/type limits apply per file. */
export type FileCountOptions = { minCount?: number; maxCount?: number };
type Limits = Readonly<
	FileCountOptions & {
		minBytes?: number;
		maxBytes?: number;
		maxTotalBytes?: number;
		contentTypes?: readonly string[];
	}
>;

/** Immutable binary declarations shared by attachment and response validation. */
export class Binary<
	K extends "file" | "files" = "file",
	O extends boolean = false,
> {
	private constructor(
		readonly kind: K,
		readonly isOptional: O,
		readonly limits: Limits,
	) {
		Object.freeze(limits);
		Object.freeze(this);
	}

	/** One required File. Size and declared media type are unrestricted by default. */
	static file(): Binary<"file"> {
		return new Binary("file", false, {});
	}
	/** A required File array. Empty arrays are accepted by default. */
	static files(options: FileCountOptions = {}): Binary<"files"> {
		if (options.minCount !== undefined) {
			integer("minCount", options.minCount);
		}
		if (options.maxCount !== undefined) {
			integer("maxCount", options.maxCount);
		}
		if ((options.minCount ?? 0) > (options.maxCount ?? Infinity)) {
			throw new Error("minCount must not exceed maxCount");
		}
		return new Binary("files", false, {
			minCount: options.minCount,
			maxCount: options.maxCount,
		});
	}
	/** Used by the response codec. Collections have no response transport yet. */
	get format(): K {
		return this.kind;
	}
	optional(): Binary<K, true> {
		return new Binary(this.kind, true, this.limits);
	}
	minBytes(value: number): Binary<K, O> {
		return this.with({ minBytes: integer("minBytes", value) });
	}
	maxBytes(value: number): Binary<K, O> {
		return this.with({ maxBytes: integer("maxBytes", value) });
	}
	/** Decimal units: 1 KB = 1,000 bytes. Fractional amounts must resolve to whole bytes. */
	maxKB(value: number): Binary<K, O> {
		return this.maxBytes(value * 1_000);
	}
	maxMB(value: number): Binary<K, O> {
		return this.maxBytes(value * 1_000_000);
	}
	maxGB(value: number): Binary<K, O> {
		return this.maxBytes(value * 1_000_000_000);
	}
	maxTotalBytes(this: Binary<"files", O>, value: number): Binary<"files", O> {
		return this.with({ maxTotalBytes: integer("maxTotalBytes", value) });
	}
	maxTotalKB(this: Binary<"files", O>, value: number): Binary<"files", O> {
		return this.maxTotalBytes(value * 1_000);
	}
	maxTotalMB(this: Binary<"files", O>, value: number): Binary<"files", O> {
		return this.maxTotalBytes(value * 1_000_000);
	}
	maxTotalGB(this: Binary<"files", O>, value: number): Binary<"files", O> {
		return this.maxTotalBytes(value * 1_000_000_000);
	}
	/** Replaces the accepted types. Supports exact MIME types and family wildcards. */
	contentTypes(...types: string[]): Binary<K, O> {
		if (types.length === 0) {
			throw new Error("contentTypes requires at least one media type");
		}
		const normalized = types.map((type) => {
			const value = type.toLowerCase();
			if (!/^[\w!#$&^.+-]+\/(?:[\w!#$&^.+-]+|\*)$/.test(value)) {
				throw new Error(`invalid content type: ${type}`);
			}
			return mime(value);
		});
		return this.with({ contentTypes: Object.freeze(normalized) });
	}
	/** Metadata-only preset, not audio decoding or codec validation. */
	audio(): Binary<K, O> {
		return this.contentTypes("audio/*");
	}
	/** Metadata-only preset, not video decoding or codec validation. */
	video(): Binary<K, O> {
		return this.contentTypes("video/*");
	}
	private with(limits: Partial<Limits>): Binary<K, O> {
		const next = { ...this.limits, ...limits };
		if ((next.minBytes ?? 0) > (next.maxBytes ?? Infinity)) {
			throw new Error("minBytes must not exceed maxBytes");
		}
		return new Binary(this.kind, this.isOptional, next);
	}
}

function integer(name: string, value: number): number {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error(`${name} must be a nonnegative safe integer`);
	}
	return value;
}

/** Normalize only common MIME aliases; never infer a type from a filename. */
function mime(type: string): string {
	const lower = type.toLowerCase();
	const aliases: Record<string, string> = {
		"audio/x-wav": "audio/wav",
		"audio/wave": "audio/wav",
		"audio/vnd.wave": "audio/wav",
		"audio/mp3": "audio/mpeg",
		"audio/x-flac": "audio/flac",
		"audio/x-midi": "audio/midi",
	};
	return aliases[lower] ?? lower;
}

/** Shared metadata validation. Does not inspect codecs, signatures or dimensions. */
export function checkFile(
	rule: Binary<"file" | "files", boolean>,
	file: { size: number; type: string },
	path: string,
): void {
	const { minBytes, maxBytes, contentTypes } = rule.limits;
	if (minBytes !== undefined && file.size < minBytes) {
		throw new Error(`${path}: minBytes ${minBytes}, received ${file.size}`);
	}
	if (maxBytes !== undefined && file.size > maxBytes) {
		throw new Error(`${path}: maxBytes ${maxBytes}, received ${file.size}`);
	}
	if (contentTypes !== undefined) {
		const type = mime(mediaType(file.type) ?? "");
		if (
			!contentTypes.some((accepted) =>
				accepted.endsWith("/*")
					? type.startsWith(accepted.slice(0, -1)) &&
						type.length > accepted.length - 1
					: type === accepted,
			)
		) {
			throw new Error(
				`${path}: contentTypes ${contentTypes.join(", ")}, received ${file.type || "(empty)"}`,
			);
		}
	}
}

/** Return the bare MIME type while accepting valid parameters such as charset. */
export function mediaType(value: string): string | undefined {
	return /^([a-z0-9!#$%&'*+.^_`|~-]+\/[a-z0-9!#$%&'*+.^_`|~-]+)(?:[ \t]*;[ \t]*[a-z0-9!#$%&'*+.^_`|~-]+=(?:[a-z0-9!#$%&'*+.^_`|~-]+|"(?:[^"\\\r\n]|\\[^\r\n])*"))*$/i
		.exec(value)?.[1]
		?.toLowerCase();
}
