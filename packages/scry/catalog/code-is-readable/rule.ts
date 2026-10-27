import type {
	Decider,
	Finding,
	Rule,
	SourceFile,
	Span,
	SyntaxNode,
	Tools,
} from "@webappwiz/scry";

/**
 * Keeps code reading as it runs: flags characters that are invisible or
 * reorder a line, and text written into the source encoded, to be decoded
 * at run time, the ways a malicious change hides what it does.
 */
export default class CodeIsReadable implements Rule {
	static readonly description =
		"Code reads as it runs: no invisible characters, and nothing encoded in the source to be decoded at run time.";
	static readonly files = "**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts,md}";
	static readonly level = "error";
	static readonly recommended = true;

	private som: Decider;

	constructor(tools: Tools) {
		this.som = tools.som;
	}

	async check(file: SourceFile): Promise<Finding[]> {
		const hidden = this.oncePerLine(file.matches(INVISIBLE)).map((span) =>
			span.flag(
				"An invisible or reordering character hides what this line says: delete it, or write it as an escape.",
			),
		);
		if (!CODE.test(file.path)) {
			return hidden;
		}
		const decoded = await Promise.all(
			this.encodedOrDecoding(file).map(async (statement) =>
				statement.flag(
					"This decodes text the source hides: write what it decodes to in plain code.",
					await this.som.decide(HIDES, statement),
					HIDES,
				),
			),
		);
		return [...hidden, ...decoded].toSorted(
			(left, right) => left.line - right.line,
		);
	}

	/**
	 * The statements that decode text or hold an encoded string, once each:
	 * `eval(atob("..."))` is one thing to read, not two.
	 */
	private encodedOrDecoding(file: SourceFile): SyntaxNode[] {
		const nodes = [
			...file.ts
				.findAll({ rule: { any: DECODERS } })
				.filter((call) => decodesText(call)),
			...file.ts
				.findAll({
					rule: { any: [{ kind: "string" }, { kind: "template_string" }] },
				})
				.filter((literal) => holdsEncodedText(literal.text)),
		];
		const statements = new Map<string, SyntaxNode>();
		for (const node of nodes) {
			const statement = enclosing(node);
			statements.set(`${statement.line}:${statement.end}`, statement);
		}
		return [...statements.values()];
	}

	/** A line with two hidden characters is one thing to fix. */
	private oncePerLine(spans: Span[]): Span[] {
		return [...new Map(spans.map((span) => [span.line, span])).values()];
	}
}

/** A character a reader sees, outside ASCII: what a joiner joins in a script or an emoji. */
const SEEN = String.raw`[^\x00-\x7F\u200B-\u200D\u2060-\u2064\uFE00-\uFE0F]`;

/**
 * Characters that change what a reader sees without being seen: bidi
 * controls (Trojan Source), zero-width spaces, word joiners, the Hangul
 * fillers that pass for blank names, variation selectors and tag
 * characters (GlassWorm's hidden payloads), the Private Use Area, and a
 * byte order mark past the start. A joiner between letters of a script or
 * emoji, and a variation selector after an emoji, are how those are
 * spelled, so they count only elsewhere.
 */
const INVISIBLE = new RegExp(
	[
		String.raw`[\u202A-\u202E\u2066-\u2069\u200B\u2060-\u2064\u3164\u115F\u1160\uFFA0\uFE00-\uFE0D\uE000-\uF8FF\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}\u{F0000}-\u{10FFFF}]`,
		String.raw`(?<!^)\uFEFF`,
		String.raw`(?<!${SEEN}\uFE0F?)[\u200C\u200D]`,
		String.raw`[\u200C\u200D](?!${SEEN})`,
		String.raw`(?<!\p{Emoji}\p{Emoji_Modifier}?)[\uFE0E\uFE0F]`,
	].join("|"),
	"gu",
);

/** What reads as text: decoding to or from it is the step a payload hides behind. */
const DECODERS: { pattern: string }[] = [
	{ pattern: "atob($$$)" },
	{ pattern: "unescape($$$)" },
	{ pattern: "String.fromCharCode($$$)" },
	{ pattern: "String.fromCodePoint($$$)" },
	{ pattern: "Buffer.from($DATA, $ENCODING)" },
	{ pattern: "Uint8Array.fromBase64($$$)" },
	{ pattern: "Uint8Array.fromHex($$$)" },
	{ pattern: "$DECODER.decode($$$)" },
];

/** Runs of encoded text long enough to carry a payload, unlike a hash or an id. */
const BASE64 = /[A-Za-z0-9+/_-]{80,}/g;
const HEX = /[0-9a-fA-F]{80,}/;
const ESCAPES =
	/(?:\\x[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\}){8,}/;

/** The statements a decoding sits in, read whole so its purpose shows. */
const STATEMENTS = [
	"lexical_declaration",
	"variable_declaration",
	"expression_statement",
	"return_statement",
	"public_field_definition",
	"pair",
];

/** Files whose code is parsed; the rest are read only for hidden characters. */
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

const HIDES =
	"Does this code hide from a reader what the program does, by decoding, unscrambling or assembling text that is written into the source in a form a person cannot read, such as base64, hex, escape sequences or character codes? Answer no when it decodes data the program receives at run time, like a request, a token, a header or a file, or when the encoded text is plainly data, like a test vector, a key or an image.";

/**
 * Whether a matched call turns bytes into text: `Buffer.from` only with an
 * encoding to read, and `.decode` only on a decoder, not a JSON or schema one.
 */
function decodesText(call: SyntaxNode): boolean {
	const encoding = call.captured("ENCODING")?.text;
	if (encoding !== undefined) {
		return /^["'`](base64|base64url|hex|binary|latin1)["'`]$/.test(encoding);
	}
	const decoder = call.captured("DECODER")?.text;
	if (decoder !== undefined) {
		return /TextDecoder|decoder$/i.test(decoder);
	}
	return true;
}

/**
 * Whether a literal holds a long run of base64, hex or escapes. Base64 mixes
 * cases and digits, which a long kebab-case name or a sentence does not.
 */
function holdsEncodedText(text: string): boolean {
	return (
		[...text.matchAll(BASE64)].some(
			([run]) => /[a-z]/.test(run) && /[A-Z]/.test(run) && /\d/.test(run),
		) ||
		HEX.test(text) ||
		ESCAPES.test(text)
	);
}

/** The statement around a node, else the node itself. */
function enclosing(node: SyntaxNode): SyntaxNode {
	return (
		node.ancestors().find((ancestor) => ancestor.is(...STATEMENTS)) ?? node
	);
}
