let libraryId: string | undefined;

export function libraryHeaders(): Record<string, string> {
	return libraryId ? { "x-footage-library": libraryId } : {};
}

export function acceptLibrary(id?: string): boolean {
	if (libraryId && id && libraryId !== id) {
		window.location.reload();
		return false;
	}
	libraryId = id;
	return true;
}
