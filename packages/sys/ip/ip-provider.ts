export interface IpProvider {
	get(): Promise<string>;
}
