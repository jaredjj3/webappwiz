/** How far a release moves the version. */
export type Bump = "patch" | "minor" | "major";

// Releases are plain major.minor.patch. Prereleases would need a policy for
// what happens to the other packages, and no repo here has asked for one.
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** Returns `version` moved by `type`. */
export function bump(version: string, type: Bump): string {
	const parts = SEMVER.exec(version);
	if (parts === null) {
		throw new Error(
			`invalid version: "${version}" (expected major.minor.patch)`,
		);
	}
	const [major, minor, patch] = [
		Number(parts[1]),
		Number(parts[2]),
		Number(parts[3]),
	];
	switch (type) {
		case "major":
			return `${major + 1}.0.0`;
		case "minor":
			return `${major}.${minor + 1}.0`;
		case "patch":
			return `${major}.${minor}.${patch + 1}`;
	}
}
