import { createHash } from "node:crypto";
import { Database } from "./Database";
import { existsSync } from "node:fs";
import { FILES_FOLDER } from "./Constants";
import { SimpleFile } from "./DatabaseTypes";
import { FileCache, SIZE } from "./FileCache";
import { readFile, writeFile } from "node:fs/promises";

const fileDataCacne = new FileCache({
	maxFileCount: 1000,
	maxMemory: SIZE.MEGABYTE * 100
});

export function SanitizeFileName(fileName: string) {
	// alphanumeric only
	return fileName.replace(/[^a-zA-Z0-9_.\-]/g, '');
}

export async function AddFile(fileName: string, maxDownloads: number | null, data: Buffer): Promise<string> {
	fileName = SanitizeFileName(fileName);

	const hash = createHash('sha256').update(data).digest('hex');

	const exists = Database.prepare('SELECT lookup FROM Files WHERE hash = ?').pluck().get(hash) as SimpleFile['lookup'];
	if (exists) return exists;

	// add the file to the database
	await writeFile(`${FILES_FOLDER}/${hash}`, data);
	const result = Database.prepare('INSERT INTO Files (fileName, hash, size, download_limit) VALUES (?, ?, ?, ?)').run(fileName, hash, data.length, maxDownloads);

	// The upload ID is attached for security and privacy reasons
	// Knowing a file hash is not enough to fetch file data, you must also know the upload ID provided by the endpoint
	return `${hash}${String(result.lastInsertRowid)}`;
}

/** Returns a basic file descriptor or null if file is not found */
export async function GetFile(lookup: string, decrement_download: boolean): Promise<{ data: Buffer, fileName: string, hash: string } | null> {
	const metadata = Database.prepare('SELECT * FROM Files WHERE lookup = ?').get(lookup) as SimpleFile | null;
	// console.log(metadata);
	if (!metadata) return null;
	if (metadata.download_limit === 0) return null;
	if (!existsSync(`${FILES_FOLDER}/${metadata.hash}`)) return null;

	if (!fileDataCacne.has(lookup)) {
		const data = await readFile(`${FILES_FOLDER}/${metadata.hash}`);
		fileDataCacne.add(lookup, data);
	}
	const data = fileDataCacne.get(lookup)!;
	if (decrement_download) Database.prepare('UPDATE Files SET download_limit = download_limit - 1 WHERE lookup = ?').run(lookup)

	return {
		data: data,
		fileName: metadata.fileName,
		hash: metadata.hash
	}
}