import * as dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/../../.env` });

import { describe, it, expect } from 'vitest';
import { AddFile, GetFile, SanitizeFileName } from '../LocalFileManagement';
import { readFileSync, rmSync } from 'node:fs';
import { Buffer } from 'buffer';
import { createHash } from "node:crypto";
import { FILES_FOLDER } from "../Constants";
import { Database } from "../Database";

describe('AddFile', () => {
	const FILE_CONTENT = Buffer.from('abc');

	it('inserts new file and returns lookup', async () => {
		const result = await AddFile('file.txt', FILE_CONTENT);
		expect(typeof result).toBe('string');

		const hash = createHash('sha256').update(FILE_CONTENT).digest('hex');
		expect( readFileSync(`${FILES_FOLDER}/${hash}`) ).toEqual(FILE_CONTENT);
	});

	it('returns existing lookup if file already exists', async () => {
		const result1 = await AddFile('file.txt', FILE_CONTENT);
		const result2 = await AddFile('file.txt', FILE_CONTENT);
		expect(result1).toEqual(result2);
	});

	it('sanitizes file name to alphanumeric, underscore, dot, and dash', async () => {
		const clean = SanitizeFileName('file@!#$.txt');
		expect(clean).toBe('file.txt');
	});
});

describe('GetFile', async () => {
	const FILE_CONTENT = Buffer.from('abc');
	const hash = createHash('sha256').update(FILE_CONTENT).digest('hex');
	const key = await AddFile('file.txt', FILE_CONTENT);

	it('returns null if file does not exist on disk', async () => {
		rmSync(`${FILES_FOLDER}/${hash}`);
		const result = await GetFile(key);
		expect(result).toBeNull();
	});

	it('returns null if file metadata not found', async () => {
		await Database.query('DELETE FROM CDN WHERE `key` = ?', [key]);
		const result = await GetFile('definitely-does-not-exist');
		expect(result).toBeNull();
	});
});