/** What a command does with the plan it has made. */
export type Mode = "print" | "run";

/** The flags that choose between the two, on top of the two that name an
 * agent. */
export interface ModeOptions {
	/** A model to ask. */
	agent?: string;
	/** A command to hand the prompt to instead. */
	exec?: string;
	/** Print to the logger and spawn nothing. */
	print?: boolean;
}

/**
 * Which of the two a caller asked for, with running the default: a command
 * given nothing but a directory is one somebody means to run.
 *
 * Naming two is an error rather than a quiet winner. All of these say what to
 * do with one plan, and letting one silently beat the other would leave a
 * caller unsure which of the two things they asked for they got.
 */
export function mode({ print, agent, exec }: ModeOptions): Mode {
	const named = [
		print === true ? "--print" : undefined,
		agent === undefined ? undefined : "--agent",
		exec === undefined ? undefined : "--exec",
	].filter((flag) => flag !== undefined);
	if (named.length > 1) {
		throw new Error(
			`${named.join(" and ")} are different things to do with one run, so pass one`,
		);
	}
	return print === true ? "print" : "run";
}
