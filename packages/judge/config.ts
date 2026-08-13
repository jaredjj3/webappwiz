import {
	DEFAULT_AGENT,
	DEFAULT_CONCURRENCY,
	type RunnerOptions,
} from "@webappwiz/rules";
import type { Rule } from "./rule/rule";

/** The rules judge runs and the two knobs a run has. There is no config file
 * and no implicit set: this is a constant a caller writes and passes in. */
export interface Config extends RunnerOptions {
	// Each rule is a class that owns its glob, its level and its document, so
	// TypeScript's job here is only composition: the rules are a typed array,
	// and spreading shared rule sets stays statically checked.
	rules: Rule[];
}

/** A rule set as its author writes it, before the defaults are filled in. */
export interface ConfigInput {
	rules: Rule[];
	agent?: string;
	concurrency?: number;
}

export const defineJudge = ({
	rules,
	agent = DEFAULT_AGENT,
	concurrency = DEFAULT_CONCURRENCY,
}: ConfigInput): Config => ({ rules, agent, concurrency });
