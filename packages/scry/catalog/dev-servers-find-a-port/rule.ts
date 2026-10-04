import type {
	Decider,
	Finding,
	Rule,
	SourceFile,
	SyntaxNode,
	Tools,
} from "@webappwiz/scry";

/** A URL on this machine with its port written out: `http://localhost:5173`. */
const FIXED_URL = /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):[1-9]\d*/;

/** A URL on this machine whose port is a plain name: `localhost:${from}`. */
const NAMED_URL =
	/\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\$\{\s*([\w$]+)\s*\}/;

/** The calls that start a server on a port. */
const LISTENING = new Set(["Bun.serve", "Deno.serve"]);

const BURIED_PORT =
	"Is this number the port a server for local development listens on, written into its configuration?";

const DEV_SERVER =
	"Is this a server someone starts on their own machine while developing, such as a dev, preview or mock server, rather than a deployed one?";

/**
 * Finds a dev server that insists on one port: a port written into a URL
 * or a server's options, a server started once with no next port to try,
 * and a URL that reports the port asked for instead of the one it got.
 */
export default class DevServersFindAPort implements Rule {
	private decider: Decider;

	constructor(tools: Tools) {
		this.decider = tools.decider;
	}

	async check(file: SourceFile): Promise<Finding[]> {
		return [
			...this.portsBuriedInUrls(file),
			...this.portsGivenToServers(file),
			...this.portsAskedForReported(file),
			...(await this.portsBuriedInConfig(file)),
			...(await this.serversTryingOnePort(file)),
		].toSorted((left, right) => left.line - right.line);
	}

	/** A string naming a port on this machine, in a fetch, a log or anywhere. */
	private portsBuriedInUrls(file: SourceFile): Finding[] {
		return file.ts
			.findAll({
				rule: { any: [{ kind: "string" }, { kind: "template_string" }] },
			})
			.filter((text) => FIXED_URL.test(text.text))
			.map((text) =>
				text.flag(
					"This URL fixes the port: take it from the server, or from a default argument or a flag.",
				),
			);
	}

	/** `.listen(3001)`, or `port: 3001` handed to a server: the one port it will ever try. */
	private portsGivenToServers(file: SourceFile): Finding[] {
		const servers = [...this.serveCalls(file), ...this.listenCalls(file)];
		const options = this.portOptions(file).filter((port) =>
			servers.some((server) => contains(server, port)),
		);
		const listens = this.listenCalls(file).map(
			(call) => call.field("arguments")?.children()[0],
		);
		return [...options, ...listens]
			.filter((port): port is SyntaxNode => port?.is("number") === true)
			.filter((port) => Number(port.text) !== 0)
			.map((port) => port.flag(fixed(port)));
	}

	/**
	 * `port: 3001` anywhere else: a config buries a dev server's port, but a
	 * deployed load balancer or a parsed option is not one, which is the
	 * decider's call.
	 */
	private async portsBuriedInConfig(file: SourceFile): Promise<Finding[]> {
		const servers = [...this.serveCalls(file), ...this.listenCalls(file)];
		const candidates = this.portOptions(file)
			.filter((port) => Number(port.text) !== 0)
			.filter((port) => !servers.some((server) => contains(server, port)));
		return Promise.all(
			candidates.map(async (port) =>
				port.flag(
					fixed(port),
					await this.decider.decide(BURIED_PORT, port),
					BURIED_PORT,
				),
			),
		);
	}

	/** The number values of `port:` keys. */
	private portOptions(file: SourceFile): SyntaxNode[] {
		return file.ts
			.findAll({
				rule: {
					kind: "pair",
					has: { field: "value", kind: "number" },
				},
			})
			.filter((pair) => pair.field("key")?.text === "port")
			.map((pair) => pair.field("value"))
			.filter((port): port is SyntaxNode => port !== undefined);
	}

	/**
	 * A URL built from the port a function that starts a server was asked
	 * for, a parameter with a default, which is not the one it got when that
	 * was taken. A parameter without one is often the port already found,
	 * handed to a callback.
	 */
	private portsAskedForReported(file: SourceFile): Finding[] {
		return file.ts
			.findAll({ rule: { kind: "template_string" } })
			.filter((url) => {
				const name = NAMED_URL.exec(url.text)?.[1];
				return name !== undefined && this.requestedPorts(url).has(name);
			})
			.map((url) =>
				url.flag(
					"This reports the port asked for: report the port the server actually got.",
				),
			);
	}

	/** The defaulted parameters of the functions around `node` that start a server. */
	private requestedPorts(node: SyntaxNode): Set<string> {
		return new Set(
			node
				.ancestors()
				.filter((scope) => this.startsAServer(scope))
				.flatMap((scope) => scope.field("parameters")?.children() ?? [])
				.filter((parameter) => parameter.field("value") !== undefined)
				.map((parameter) => parameter.field("pattern")?.text ?? ""),
		);
	}

	private startsAServer(scope: SyntaxNode): boolean {
		return (
			scope.field("parameters") !== undefined &&
			[...this.serveCalls(scope), ...this.listenCalls(scope)].length > 0
		);
	}

	/**
	 * A server started once, outside any loop, with no next port to try when
	 * its port is taken. Whether it is a dev server is the decider's call.
	 */
	private async serversTryingOnePort(file: SourceFile): Promise<Finding[]> {
		const candidates = [...this.serveCalls(file), ...this.listenCalls(file)]
			.filter((call) => !hasFixedPort(call))
			.filter((call) => !call.ancestors().some((node) => isLoop(node)));
		return Promise.all(
			candidates.map(async (call) =>
				call.flag(
					"This server tries one port: try the next one until it gets a listener.",
					await this.decider.decide(DEV_SERVER, call),
					DEV_SERVER,
				),
			),
		);
	}

	private serveCalls(within: SourceFile | SyntaxNode): SyntaxNode[] {
		return root(within)
			.findAll({ rule: { kind: "call_expression" } })
			.filter((call) => LISTENING.has(call.field("function")?.text ?? ""));
	}

	/** `server.listen(port)`, on a node or express server. */
	private listenCalls(within: SourceFile | SyntaxNode): SyntaxNode[] {
		return root(within)
			.findAll({
				rule: {
					kind: "call_expression",
					has: { field: "function", kind: "member_expression" },
				},
			})
			.filter(
				(call) =>
					call.field("function")?.field("property")?.text === "listen" &&
					(call.field("arguments")?.children().length ?? 0) > 0,
			);
	}
}

function isLoop(node: SyntaxNode): boolean {
	return node.is(
		"for_statement",
		"for_in_statement",
		"while_statement",
		"do_statement",
	);
}

/** Whether a server call's port is a number literal, which is flagged already. */
function hasFixedPort(call: SyntaxNode): boolean {
	return /\bport\s*:\s*\d|\.listen\(\s*\d/.test(call.text);
}

function fixed(port: SyntaxNode): string {
	return `Port ${port.text} is fixed: make it a default argument or a flag, and try the next one when it is taken.`;
}

/** Whether `inner` lies within `outer`. */
function contains(outer: SyntaxNode, inner: SyntaxNode): boolean {
	return inner
		.ancestors()
		.some((node) => node.line === outer.line && node.text === outer.text);
}

/** A file's whole tree, or the node itself. */
function root(within: SourceFile | SyntaxNode): SyntaxNode {
	return "ts" in within ? within.ts.root : within;
}
