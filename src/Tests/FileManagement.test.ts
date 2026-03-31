import { describe, it, expect } from 'vitest';
import { AddFile, GetFile, SanitizeFileName } from '../FileManagement';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { Buffer } from 'buffer';
import { createHash } from "node:crypto";
import { FILES_FOLDER } from "../Constants";
import { Database } from "../Database";
import { SimpleFile } from "../DatabaseTypes";

describe('AddFile', () => {
	const FILE_CONTENT = Buffer.from('abc');
	// const hash = createHash('sha256').update(FILE_CONTENT).digest('hex');

	// afterEach(() => {
	// 	Database.prepare('DELETE FROM Files WHERE hash = ?').run(hash);
	// 	if (existsSync(`${FILES_FOLDER}/${hash}`)) rmSync(`${FILES_FOLDER}/${hash}`);
	// })

	it('inserts new file and returns lookup', async () => {
		const result = await AddFile('file.txt', null, FILE_CONTENT);
		expect(typeof result).toBe('string');

		const hash = createHash('sha256').update(FILE_CONTENT).digest('hex');
		expect( readFileSync(`${FILES_FOLDER}/${hash}`) ).toEqual(FILE_CONTENT);
	});

	it('returns existing lookup if file already exists', async () => {
		const result1 = await AddFile('file.txt', null, FILE_CONTENT);
		const result2 = await AddFile('file.txt', null, FILE_CONTENT);
		expect(result1.slice(0, 64)).toEqual(result2.slice(0, 64));
		expect(result1.slice(65)).toEqual(result2.slice(65));
	});

	it('sanitizes file name to alphanumeric, underscore, dot, and dash', async () => {
		const clean = SanitizeFileName('file@!#$.txt');
		expect(clean).toBe('file.txt');
	});
});

describe('GetFile', async () => {
	const FILE_CONTENT = Buffer.from('abc');
	const hash = createHash('sha256').update(FILE_CONTENT).digest('hex');

	// spoofing what AddFile() does to avoid async lol
	writeFileSync(`${FILES_FOLDER}/${hash}`, FILE_CONTENT);
	const { lastInsertRowid } = Database.prepare('INSERT INTO Files (fileName, size, hash, download_limit) VALUES (?, ?, ?, ?)').run('test.txt', FILE_CONTENT.length, hash, 1);
	const lookup = hash + String(lastInsertRowid);

	it('returns file data and decrements download if requested', async () => {
		const result = await GetFile(lookup, true);
		expect(result).toMatchObject({ data: FILE_CONTENT, fileName: 'test.txt', hash: hash });

		const entry = Database.prepare('SELECT * FROM Files WHERE hash = ?').get(hash) as SimpleFile;
		expect(entry.download_limit).toBe(0);
	});

	it('returns null if download_limit is 0', async () => {
		const result = await GetFile(lookup, false);
		expect(result).toBeNull();
	});

	it('returns null if file does not exist on disk', async () => {
		rmSync(`${FILES_FOLDER}/${hash}`);
		const result = await GetFile(lookup, false);
		expect(result).toBeNull();
	});

	it('returns null if file metadata not found', async () => {
		Database.prepare('DELETE FROM Files WHERE hash = ?').run(hash);
		const result = await GetFile('definitely-does-not-exist', false);
		expect(result).toBeNull();
	});
});