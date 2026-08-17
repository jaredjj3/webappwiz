import { color } from "webappwiz/log";

/**
 * Row one is the header. Columns line up by what a cell shows rather than by
 * what it holds, since a colored cell carries escapes nobody sees.
 */
export const table = (rows: string[][]): string[] => {
	const width = (cell: string): number => color.strip(cell).length;
	const widths = rows[0]?.map((_, i) =>
		Math.max(...rows.map((row) => width(row[i] ?? ""))),
	);
	return rows.map((row) =>
		row
			.map((cell, i) =>
				cell.padEnd((widths?.[i] ?? 0) + cell.length - width(cell)),
			)
			.join("   ")
			.trimEnd(),
	);
};
