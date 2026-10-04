import type {
	Decider,
	Finding,
	Rule,
	SourceFile,
	SyntaxNode,
	Tools,
} from "@webappwiz/scry";

/** A property name that announces something happened: `onDone`, `onError`. */
const NOTIFICATION = /^on[A-Z]/;

/** The declarations whose parameters are this file's own API. */
const DECLARATIONS = [
	"function_declaration",
	"generator_function_declaration",
	"method_definition",
	"method_signature",
	"abstract_method_signature",
];

/** What a parameter is, whether required or not. */
const PARAMETERS = ["required_parameter", "optional_parameter"];

/**
 * Finds functions taken where an object belongs: a function a constructor
 * keeps as a field, a bag of `onX` callbacks, and a named function type
 * that several things implement or something injects. Whether any other
 * function parameter runs during the call, to compute its result, is a
 * decider's call. A finding points at the declaration, where one
 * `scry-ignore` covers it.
 */
export default class ObjectsOverCallbacks implements Rule {
	static readonly description =
		"A function called after the call returns is an event or a dependency, and a function type you name is an interface.";
	static readonly files = "**/*.{ts,tsx}";
	static readonly level = "warning";
	static readonly recommended = true;

	private decider: Decider;

	constructor(tools: Tools) {
		this.decider = tools.decider;
	}

	async check(file: SourceFile): Promise<Finding[]> {
		return [
			...(await this.functionParameters(file)),
			...this.callbackBags(file),
			...this.namedFunctionTypes(file),
		].toSorted((left, right) => left.line - right.line);
	}

	/**
	 * Each function-typed parameter of the file's own functions, judged by
	 * when its function runs: across the object's life when a constructor
	 * keeps it as a field, and otherwise as the decider reads the function.
	 * A name like `onDone` does not settle it: `subscribe(onChange)` is how
	 * an events API takes a listener.
	 */
	private async functionParameters(file: SourceFile): Promise<Finding[]> {
		return Promise.all(
			this.ownParameters(file)
				.filter(({ parameter }) => takesFunction(parameter))
				.map(async ({ owner, parameter }) => {
					const name = parameter.field("pattern")?.text ?? "";
					const of = ownerName(owner);
					if (of === "constructor" && keptAsField(parameter)) {
						return owner.flag(
							`The constructor keeps ${name} as a dependency: name an interface and inject an object.`,
						);
					}
					return this.askWhenItRuns(owner, name, of);
				}),
		);
	}

	/** Whether a parameter's function is a notification or a dependency, rather than part of computing the result. */
	private async askWhenItRuns(
		owner: SyntaxNode,
		name: string,
		of: string,
	): Promise<Finding> {
		const question = `Does ${of} keep the function ${name} to call later, or call it to announce that something happened, rather than only using it to compute what ${of} returns, like a predicate, comparator or transform? Answer no when ${of} exists to register a listener, like subscribe, on or defer.`;
		return owner.flag(
			`${name} runs after ${of} returns, or announces something: inject an object behind an interface, or expose Events.`,
			await this.decider.decide(question, owner),
			question,
		);
	}

	/** An interface or object type holding `onX` callbacks: an events interface waiting to exist. */
	private callbackBags(file: SourceFile): Finding[] {
		const bags = new Map<number, SyntaxNode>();
		for (const property of file.ts.findAll({
			rule: { kind: "property_signature" },
		})) {
			const bag = property.parent();
			if (
				bag !== undefined &&
				NOTIFICATION.test(property.field("name")?.text ?? "") &&
				takesFunction(property)
			) {
				bags.set(bag.line, declaring(bag));
			}
		}
		return [...bags.values()].map((bag) => {
			const name = bag.field("name")?.text;
			return bag.flag(
				`${name ?? "This options bag"} is a bag of callbacks: expose Events from webappwiz/events instead.`,
			);
		});
	}

	/**
	 * A function type given a name, once more than one thing in the file
	 * implements it or anything injects it: a constructor takes it, or a
	 * class keeps it in a field. A function merely taking one to run is not
	 * injecting it.
	 */
	private namedFunctionTypes(file: SourceFile): Finding[] {
		return file.ts
			.findAll({
				rule: {
					kind: "type_alias_declaration",
					has: { field: "value", kind: "function_type" },
				},
			})
			.flatMap((alias) => {
				const name = alias.field("name")?.text ?? "";
				const implemented = this.annotatedWith(
					file,
					name,
					"variable_declarator",
				).length;
				const injected = this.annotatedWith(
					file,
					name,
					...PARAMETERS,
					"public_field_definition",
				).filter(
					(node) =>
						node.is("public_field_definition") ||
						ownerName(node.parent()?.parent() ?? node) === "constructor",
				).length;
				if (implemented < 2 && injected === 0) {
					return [];
				}
				return [
					alias.flag(
						`${name} is a function type that ${injected > 0 ? "something injects" : "several things implement"}: make it an interface with a method.`,
					),
				];
			});
	}

	/** The nodes of these kinds whose type annotation is the named type. */
	private annotatedWith(
		file: SourceFile,
		name: string,
		...kinds: string[]
	): SyntaxNode[] {
		return file.ts
			.findAll({ rule: { any: kinds.map((kind) => ({ kind })) } })
			.filter((node) => namesType(typeOf(node), name));
	}

	/**
	 * The parameters of the file's own functions and methods, with what
	 * declares them. A function handed to someone else's API is that API's
	 * contract, so only functions declared or bound to a name count.
	 */
	private ownParameters(
		file: SourceFile,
	): { owner: SyntaxNode; parameter: SyntaxNode }[] {
		return file.ts
			.findAll({ rule: { any: PARAMETERS.map((kind) => ({ kind })) } })
			.flatMap((parameter) => {
				const owner = parameter.parent()?.parent();
				const own =
					owner !== undefined &&
					(owner.is(...DECLARATIONS) ||
						(owner.is("arrow_function", "function_expression") &&
							owner.parent()?.is("variable_declarator") === true));
				return own ? [{ owner, parameter }] : [];
			});
	}
}

/** The type a parameter, field, property or variable is annotated with. */
function typeOf(node: SyntaxNode): SyntaxNode | undefined {
	return node
		.children()
		.find((child) => child.is("type_annotation"))
		?.children()[0];
}

/** Whether a parameter or property is typed as a function, maybe optional or in a union. */
function takesFunction(node: SyntaxNode): boolean {
	return isFunctionType(typeOf(node));
}

function isFunctionType(type: SyntaxNode | undefined): boolean {
	if (type === undefined) {
		return false;
	}
	if (type.is("function_type")) {
		return true;
	}
	return (
		type.is("union_type", "parenthesized_type") &&
		type.children().some((part) => isFunctionType(part))
	);
}

/** Whether a type is `name`, or `name<...>`. */
function namesType(type: SyntaxNode | undefined, name: string): boolean {
	const named = type?.is("generic_type") ? type.field("name") : type;
	return named?.is("type_identifier") === true && named.text === name;
}

/** Whether a constructor parameter declares a field, so the object keeps it. */
function keptAsField(parameter: SyntaxNode): boolean {
	return /^(private|protected|public|readonly|override)\b/.test(parameter.text);
}

/** What a function or method is called, by its declaration or the variable holding it. */
function ownerName(owner: SyntaxNode): string {
	const named = owner.field("name") ?? owner.parent()?.field("name");
	return named?.text ?? "the function";
}

/** The interface an interface body belongs to, or the object type itself. */
function declaring(bag: SyntaxNode): SyntaxNode {
	const parent = bag.parent();
	return parent?.is("interface_declaration") ? parent : bag;
}
