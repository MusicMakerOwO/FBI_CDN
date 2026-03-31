import { describe, it, expect } from 'vitest';
import { FileCache, SIZE } from '../FileCache';
import { Buffer } from 'buffer';

describe('FileCache', () => {
	it('adds and retrieves a file', () => {
		const cache = new FileCache({ maxFileCount: 3, maxMemory: SIZE.MEGABYTE });
		const data = Buffer.from('hello');
		cache.add('file1', data);
		expect(cache.get('file1')).toEqual(data);
	});

	it('returns null for missing file', () => {
		const cache = new FileCache({ maxFileCount: 2, maxMemory: SIZE.KILOBYTE });
		expect(cache.get('missing')).toBeNull();
	});

	it('evicts oldest file when maxFileCount is exceeded', () => {
		const cache = new FileCache({ maxFileCount: 2, maxMemory: SIZE.MEGABYTE });
		cache.add('a', Buffer.from('a'));
		cache.add('b', Buffer.from('b'));
		cache.add('c', Buffer.from('c'));
		expect(cache.has('a')).toBe(false);
		expect(cache.has('b')).toBe(true);
		expect(cache.has('c')).toBe(true);
	});

	it('evicts largest files to stay under maxMemory', () => {
		const cache = new FileCache({ maxFileCount: 10, maxMemory: 10 });
		cache.add('small', Buffer.alloc(3));
		cache.add('medium', Buffer.alloc(4));
		cache.add('large', Buffer.alloc(10));
		expect(cache.has('small')).toBe(false);
		expect(cache.has('medium')).toBe(false);
		expect(cache.has('large')).toBe(true);
	});

	it('throws if file is larger than maxMemory', () => {
		const cache = new FileCache({ maxFileCount: 2, maxMemory: 5 });
		expect(() => cache.add('big', Buffer.alloc(10))).toThrow();
	});

	it('refreshes timestamp on get', async () => {
		const cache = new FileCache({ maxFileCount: 2, maxMemory: 100 });
		cache.add('x', Buffer.from('x'));
		const before = cache.files.get('x')!.timestamp;
		await new Promise(r => setTimeout(r, 2));
		cache.get('x');
		const after = cache.files.get('x')!.timestamp;
		expect(after).toBeGreaterThanOrEqual(before);
	});

	it('deletes and clears files', () => {
		const cache = new FileCache({ maxFileCount: 2, maxMemory: 100 });
		cache.add('a', Buffer.from('a'));
		cache.add('b', Buffer.from('b'));
		expect(cache.has('a')).toBe(true);
		cache.delete('a');
		expect(cache.has('a')).toBe(false);
		cache.clear();
		expect(cache.has('b')).toBe(false);
	});

	it('memory property returns correct size', () => {
		const cache = new FileCache({ maxFileCount: 2, maxMemory: 100 });
		cache.add('a', Buffer.alloc(10));
		cache.add('b', Buffer.alloc(20));
		expect(cache.memory).toBe(30);
	});

	it('overwrites file with same lookup and updates memory', () => {
		const cache = new FileCache({ maxFileCount: 2, maxMemory: 100 });
		cache.add('dup', Buffer.alloc(10));
		cache.add('dup', Buffer.alloc(20));
		expect(cache.memory).toBe(20);
		expect(cache.get('dup')).toEqual(Buffer.alloc(20));
	});

	it('does not evict files if not needed when adding small file', () => {
		const cache = new FileCache({ maxFileCount: 3, maxMemory: 100 });
		cache.add('a', Buffer.alloc(10));
		cache.add('b', Buffer.alloc(10));
		cache.add('c', Buffer.alloc(10));
		expect(cache.has('a')).toBe(true);
		expect(cache.has('b')).toBe(true);
		expect(cache.has('c')).toBe(true);
	});

	it('handles adding and deleting files repeatedly', () => {
		const cache = new FileCache({ maxFileCount: 2, maxMemory: 100 });
		cache.add('a', Buffer.alloc(10));
		cache.delete('a');
		cache.add('b', Buffer.alloc(10));
		expect(cache.has('a')).toBe(false);
		expect(cache.has('b')).toBe(true);
	});

	it('clear on empty cache does not throw', () => {
		const cache = new FileCache({ maxFileCount: 2, maxMemory: 100 });
		cache.add('b', Buffer.alloc(10));
		expect(cache.memory).toBe(10);
		expect(() => cache.clear()).not.toThrow();
		expect(cache.memory).toBe(0);
	});
});