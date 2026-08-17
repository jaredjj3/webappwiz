/** The git a release speaks, scoped to one repository. */
export interface Git {
	/** Whether the tree has no uncommitted changes. */
	clean(): Promise<boolean>;
	branch(): Promise<string>;
	/** Where releases go out from. */
	defaultBranch(): Promise<string>;
	/** Commits every tracked change. A clean tree is already committed, so it passes. */
	commitAll(message: string): Promise<void>;
	/** Tags the commit at HEAD. A tag already there is left where it is. */
	tag(tag: string): Promise<void>;
	push(ref: string): Promise<void>;
}
