import { createHash } from "node:crypto";
import { Database } from "./Database";
import { existsSync } from "node:fs";
import { FILES_FOLDER } from "./Constants";
import { SimpleFile } from "./DatabaseTypes";
import { readFile, writeFile } from "node:fs/promises";
import * as Cloud from "./Cloud";
import { Fetch } from "./Cloud";
import { customAlphabet } from "nanoid";
import { DeriveContentType } from "./ContentType";

// Birthday problem visualizer: https://zelark.github.io/nano-id-cc/
// This will require about ~30 trillion IDs for a 1% collision chance
const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 16);

export function SanitizeFileName(fileName: string) {
	// alphanumeric only
	return fileName.replace(/[^a-zA-Z0-9_.\-]/g, '');
}

export async function AddFile(fileName: string, data: Buffer): Promise<string> {
	fileName = SanitizeFileName(fileName);

	const hash = createHash('sha256').update(data).digest('hex');
	const existingKey = await Database.query('SELECT \`key\` FROM CDN WHERE hash = ?', [hash]).then(x => x[0]?.key) as SimpleFile['key'] | null;
	if (existingKey) return existingKey;

	const key = nanoid();

	// add the file to the database
	await writeFile(`${FILES_FOLDER}/${hash}`, data);
	await Database.query('INSERT INTO CDN (fileName, type, hash, `key`, location) VALUES (?, ?, ?, ?, ?)', [fileName, DeriveContentType(fileName), hash, key, 'local']);

	// Replication for testing
	await Cloud.Upload(fileName, data, key);

	return key;
}

/** Returns a basic file descriptor or null if file is not found */
export async function GetFile(keu: string): Promise<{ data: ArrayBuffer, fileName: string, hash: string } | null> {
	const metadata = await Database.query('SELECT * FROM CDN WHERE `key` = ?', [keu]).then(x => x[0]) as SimpleFile | null;
	// console.log(metadata);
	if (!metadata) return null;
	if (metadata.location === 'local') {
		if (!existsSync(`${FILES_FOLDER}/${metadata.hash}`)) return null;
		const data = await readFile(`${FILES_FOLDER}/${metadata.hash}`);
		return {
			data    : data.buffer,
			fileName: metadata.fileName,
			hash    : metadata.hash
		}
	} else {
		const data = await Fetch(keu);
		return {
			data    : data,
			fileName: metadata.fileName,
			hash    : metadata.hash
		}
	}
}