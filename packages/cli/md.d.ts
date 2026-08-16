// Bun imports any file as text with `with { type: "text" }`, but its types
// only declare the extensions it treats as text by default. Skills import the
// markdown they install, so tsc needs to be told.
declare module "*.md" {
	const text: string;
	export default text;
}
