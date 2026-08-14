import type { AgentOptions } from "@webappwiz/rules";

/** What a command does with the plan it has made. */
export type Mode = "print" | "estimate" | "run";

/** The flags that choose between the three, on top of the two that name an
 * agent. */
export interface ModeOptions extends AgentOptions {
	/** Print to the logger and spawn nothing. */
	print?: boolean;
	/** Print what a run would read, and spawn nothing. */
	estimate?: boolean;
}

/**
 * Which of the three a caller asked for, with running the default: a command
 * given nothing but a directory is one somebody means to run.
 *
 * Naming two is an error rather than a quiet winner. All of these say what to
 * do with one plan, and letting one silently beat the other would leave a
 * caller unsure which of the two things they asked for they got.
 */
export function mode({ print, estimate, agent, exec }: ModeOptions): Mode {
	const named = [
		print === true ? "--print" : undefined,
		estimate === true ? "--estimate" : undefined,
		agent === undefined ? undefined : "--agent",
		exec === undefined ? undefined : "--exec",
	].filter((flag) => flag !== undefined);
	if (named.length > 1) {
		throw new Error(
			`${named.join(" and ")} are different things to do with one run, so pass one`,
		);
	}
	if (print === true) {
		return "print";
	}
	return estimate === true ? "estimate" : "run";
}
