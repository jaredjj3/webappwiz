import { Rule } from "./rule";
import skeleton from "./template/RULE.md" with { type: "text" };

/**
 * A `RULE.md` for a rule named `name`, ready to fill in: every field a review
 * needs, the shape a rule usually takes, and a comment saying what goes where.
 * It parses as it is, so `rules ls` accepts it before it is written.
 */
export function template(name: string): string {
	const title = name
		.split("-")
		.map((word, index) =>
			index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word,
		)
		.join(" ");
	const text = skeleton
		.replaceAll("{{name}}", name)
		.replaceAll("{{title}}", title);
	Rule.parse(text, { id: name });
	return text;
}
