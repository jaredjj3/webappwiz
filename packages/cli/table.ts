import { color } from "webappwiz/log";

/**
 * Lays out rows of cells as aligned columns, one line per row, for printing to
 * a terminal. Row one is the header. Cells may be colored.
 */
export const table = (rows: string[][]): string[] => {
	// Columns line up by what a cell shows rather than by what it holds, since
	// a colored cell carries escapes nobody sees.
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
