/** The git a release speaks, scoped to one repository. */
export interface Git {
	/** Whether the tree has no uncommitted changes. */
	clean(): Promise<boolean>;
	branch(): Promise<string>;
	/** Where releases go out from. */
	defaultBranch(): Promise<string>;
	/** The subject line of the commit at HEAD, which says whether it is a release. */
	headSubject(): Promise<string>;
	hasTag(tag: string): Promise<boolean>;
	/** Commits every tracked change. A clean tree is already committed, so it passes. */
	commitAll(message: string): Promise<void>;
	tag(tag: string): Promise<void>;
	push(ref: string): Promise<void>;
}
