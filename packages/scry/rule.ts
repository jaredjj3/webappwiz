import type { Decider } from "./decider";
import type { SourceFile } from "./source-file";

/**
 * A rule's check: it reads one file and says where the file breaks the rule.
 * A rule's `rule.ts` default-exports a class implementing it, whose static
 * members are the rule's settings (see `RuleClass`). Matching its `files`,
 * its threshold, `scry-ignore` comments and the report are not its concern:
 * the check that runs it handles those.
 */
export interface Rule {
	check(file: SourceFile): Promise<Finding[]>;
}

/** One place a file breaks a rule, as the rule sees it. */
export interface Finding {
	/** From 1. */
	line: number;
	message: string;
	/**
	 * How sure whatever decided it was, from 0 to 1: 1 when code decided it,
	 * a decider's answer when one did. Under the rule's threshold, the check
	 * drops it.
	 */
	confidence: number;
	/** The question a decider answered, when one decided it. */
	decidedBy?: string;
}

/**
 * What every rule is built with. A rule's constructor takes this and keeps
 * what it uses; a rule that only reads code takes nothing. A tool that costs
 * something to use, like a model, costs nothing until a rule uses it.
 */
export interface Tools {
	/**
	 * A System One model (SOM), like Clef or Jev: it reads the file and
	 * answers a yes-or-no question about a span of it with the probability
	 * of yes, at once and writing no text. Fast and cheap enough to ask
	 * about every candidate code finds, so it is what a rule asks first.
	 */
	som: Decider;
	/**
	 * A large language model (LLM), like Claude: it reasons in text before
	 * it answers the same questions, so it is slower and dearer. Only for a
	 * question `wiz scry eval` shows the som still gets wrong, because
	 * answering takes following the code rather than reading it.
	 */
	llm: Decider;
}

/** How loudly a violation reports. */
export type Level = "error" | "warning";
export const LEVELS = ["error", "warning"] as const;

/** What one of a rule's options can be set to. */
export type OptionValue = string | number | boolean;

/** A rule's options by name. */
export type Options = Readonly<Record<string, OptionValue>>;

/**
 * What a rule's `rule.ts` default-exports: a class implementing `Rule`, built
 * with the tools and its options, whose static members say what the rule
 * expects and which files it reads.
 */
export type RuleClass = (new (
	tools: Tools,
	options: Options,
) => Rule) &
	RuleSettings;

/** A rule's settings, the static members of its class. */
export interface RuleSettings {
	/** One line for a listing, and for planning who reads the rule. */
	readonly description: string;
	/** Glob choosing which files the rule reads; every file when not given. */
	readonly files?: string;
	/** How loudly it reports; `error` when not given. */
	readonly level?: Level;
	/**
	 * How sure a check has to be that a file breaks the rule before it is
	 * reported, from 0 to 1; 0.7 when not given. A finding code decides is
	 * sure, so only a decider's are ever under it.
	 */
	readonly threshold?: number;
	/**
	 * Whether a catalog offers the rule as one to start with, which is what
	 * `scry add --recommended` copies in; not when not given. A project's own
	 * rule needs no say: it is already installed.
	 */
	readonly recommended?: boolean;
	/**
	 * What a project can tune, by name, each with its default, like
	 * `{ limit: 500 }`; none when not given. A project's config sets them
	 * under `scry.rules.<id>`, each to a value of its default's type, and the
	 * rule's constructor gets the defaults with those laid over them.
	 */
	readonly options?: Options;
}
