// Bun imports any file as text with `with { type: "text" }`, but its types
// only declare the extensions it treats as text by default. Skills import the
// markdown they install, and the scry catalog the cli bundles imports rule
// scripts, so tsc needs to be told about both.
declare module "*.md" {
	const text: string;
	export default text;
}

declare module "*.sh" {
	const text: string;
	export default text;
}
