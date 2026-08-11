export interface HostMapper {
	map(hostname: string, ip: string): Promise<void>;
}
