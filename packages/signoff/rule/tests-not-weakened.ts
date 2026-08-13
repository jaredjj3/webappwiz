import type { Finding } from "@webappwiz/rules";
import { type Changeset, deleted } from "../changeset";
import type { Checked } from "./rule";
import doc from "./tests-not-weakened.md" with { type: "text" };

/** `.skip` and `.only` on any of the runners a suite is written with. */
const SILENCED = /\b(?:it|test|describe|suite)\b[\w.]*\.(skip|only)\s*\(/;

export class TestsNotWeakened implements Checked {
	readonly id = "tests-not-weakened";
	readonly decides = "all";
	readonly document = doc;

	check(changeset: Changeset): Finding[] {
		const gone = deleted(changeset);
		const findings: Finding[] = [];
		for (const change of changeset.changes) {
			if (change.status === "deleted") {
				const subject = TestsNotWeakened.subject(change.path);
				// Deleting a test with the code it tested is ordinary work. Deleting
				// it while that code survives is the case worth a person.
				if (subject !== undefined && !gone.has(subject)) {
					findings.push({
						rule: this.id,
						file: change.path,
						message: `test file deleted while ${subject} survives`,
					});
				}
				continue;
			}
			for (const [i, line] of change.added.entries()) {
				const match = SILENCED.exec(line);
				if (match) {
					findings.push({
						rule: this.id,
						file: change.path,
						// The line number is into the added lines, not the file: a
						// changeset knows what a change introduced, not where it landed.
						line: i + 1,
						message: `.${match[1]} added to a test`,
					});
				}
			}
		}
		return findings;
	}

	/** The file a test file tests, or undefined when the path is not a test. */
	private static subject(path: string): string | undefined {
		const match = /^(.*)\.test(\.[cm]?[jt]sx?)$/.exec(path);
		return match ? `${match[1]}${match[2]}` : undefined;
	}
}
