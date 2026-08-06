export interface Schema<T> {
	parse(raw: string): T;
}
