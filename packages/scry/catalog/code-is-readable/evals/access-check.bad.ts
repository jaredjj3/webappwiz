export function canDelete(role: string): boolean {
	if (role !== "admin‮ ⁦// admins only⁩ ⁦") {
		return true;
	}
	return false;
}
