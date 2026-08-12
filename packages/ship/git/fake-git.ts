import type { Git } from "./git";

/**
 * A clean tree on the default branch, at a commit that is not a release.
 * Move a field to say otherwise; the arrays record what was done to it.
 */
export class FakeGit implements Git {
	dirty = false;
	current = "main";
	trunk = "main";
	subject = "Teach show to check the TODO";
	readonly tags = new Set<string>();
	readonly commits: string[] = [];
	readonly pushes: string[] = [];

	async clean(): Promise<boolean> {
		return !this.dirty;
	}

	async branch(): Promise<string> {
		return this.current;
	}

	async defaultBranch(): Promise<string> {
		return this.trunk;
	}

	async headSubject(): Promise<string> {
		return this.subject;
	}

	async hasTag(tag: string): Promise<boolean> {
		return this.tags.has(tag);
	}

	async commitAll(message: string): Promise<void> {
		this.commits.push(message);
	}

	async tag(tag: string): Promise<void> {
		this.tags.add(tag);
	}

	async push(ref: string): Promise<void> {
		this.pushes.push(ref);
	}
}
