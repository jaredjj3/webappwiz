/** What happened to one file between the base and the working tree. */
export type Status = "added" | "modified" | "deleted";

/** One file's part in a change. */
export interface Change {
	/** Repo-relative, as git names it. */
	path: string;
	status: Status;
	/**
	 * The lines this change introduces, without their leading `+`. Empty for a
	 * deletion, and empty for a file too large or too binary to diff: a rule
	 * reading these is asking what the change added, not what the file holds.
	 */
	added: string[];
}

/**
 * A change as signoff judges it: every file it touches, and the lines it adds.
 *
 * Uncommitted and untracked work counts. Outside arbor, which refuses to merge
 * a dirty tree, the usual caller is a loop that has just finished editing and
 * committed nothing, so a changeset that only saw commits would miss the whole
 * change.
 */
export interface Changeset {
	/** The ref the change is measured against. */
	base: string;
	changes: Change[];
}

/** Every path the change deletes, for a rule asking what survived it. */
export const deleted = (changeset: Changeset): Set<string> =>
	new Set(
		changeset.changes
			.filter((change) => change.status === "deleted")
			.map((change) => change.path),
	);
