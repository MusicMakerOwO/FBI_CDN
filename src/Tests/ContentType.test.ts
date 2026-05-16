import { describe, it, expect } from 'vitest';
import { DeriveContentType } from '../ContentType';

describe('DeriveContentType', () => {
	it('returns text mime type for txt files', () => {
		expect(DeriveContentType('notes.txt')).toBe('text/plain');
	});

	it('returns whitelisted application mime type for json files', () => {
		expect(DeriveContentType('payload.json')).toBe('application/json');
	});

	it('returns image mime type for uppercase image extension', () => {
		expect(DeriveContentType('PHOTO.JPG')).toBe('image/jpeg');
	});

	it('returns octet-stream when filename has no extension', () => {
		expect(DeriveContentType('README')).toBe('application/octet-stream');
	});

	it('returns octet-stream for unknown extension', () => {
		expect(DeriveContentType('archive.unknownext')).toBe('application/octet-stream');
	});

	it('returns octet-stream for detected but non-whitelisted application mime type', () => {
		expect(DeriveContentType('module.wasm')).toBe('application/octet-stream');
	});
});