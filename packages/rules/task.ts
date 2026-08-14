/**
 * One agent call: the rules it applies, and the material it applies them to.
 *
 * How the material was chosen is the caller's business. The harness never
 * walks a tree, globs a path or reads a diff; it is handed text and asked to
 * get an answer about it.
 */
export interface Task {
	/** The rules this call judges: the ids findings are filed under, and the
	 * documents that go into the prompt. All the harness needs of a rule. */
	rules: Array<{ id: string; document: string }>;
	/** The material, rendered by the caller: a list of files to read, a diff,
	 * anything the prompt should carry. */
	context: string;
	/** Prompt text only this caller needs, slotted in before the output
	 * contract. Ignore markers, house conventions, whatever the rules assume. */
	instructions?: string;
	/** How reports name this task. */
	label: string;
	/**
	 * The prompt plus whatever it tells the agent to read. A floor on what the
	 * call costs, and the only part of the cost that can be known before paying
	 * it: the agent's own system prompt and whatever it re-reads are not in
	 * here. Callers that cannot price their material leave it undefined.
	 */
	bytes?: number;
}
