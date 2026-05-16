import { lookup as lookupMimeType } from "mime-types";

const COMMON_MIME_PREFIXES = ['text/', 'image/', 'audio/', 'video/'] as const;
const COMMON_MIME_TYPES = new Set([
	'application/json',
	'application/pdf',
	'application/zip',
	'application/gzip',
	'application/xml',
	'application/javascript',
	'application/x-javascript',
	'application/x-www-form-urlencoded',
	'multipart/form-data',
]);

export function DeriveContentType(fileName: string): string {
	const detectedType = lookupMimeType(fileName);
	if (typeof detectedType !== 'string') return 'application/octet-stream';

	if (
		COMMON_MIME_TYPES.has(detectedType) ||
		COMMON_MIME_PREFIXES.some((prefix) => detectedType.startsWith(prefix))
	) {
		return detectedType;
	}

	// Treat unknown or uncommon extensions as raw binary data.
	return 'application/octet-stream';
}