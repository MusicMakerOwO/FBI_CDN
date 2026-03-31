import { SimpleFile } from "./DatabaseTypes";

export const SIZE = {
	BYTE    : 1,
	KILOBYTE: 1024,
	MEGABYTE: 1024 * 1024,
	GIGABYTE: 1024 * 1024 * 1024
} as const;

export class FileCache {
	maxFileCount: number;
	maxMemory: number;
	files: Map<string, { data: Buffer, timestamp: ReturnType<typeof Date.now> }>;

	constructor(options: {
		/** Maximum amount of files to be stored at once */
		maxFileCount: number,
		/** Maximum combined file size of all files in cache */
		maxMemory: number
	}) {
		this.maxFileCount = options.maxFileCount;
		this.maxMemory = options.maxMemory;
		this.files = new Map();
	}

	/** Returns (roughly) the amount of ram being used in bytes */
	get memory(): number {
		return this.files.values()
		.reduce((size, { data }) => size + data.length, 0);
	}

	/** Evict the largest files until we are under the target memory */
	pruneSize(targetMemory = this.maxMemory * 0.9) {
		if (this.memory <= targetMemory) return;

		const files = Array.from(this.files.entries());
		files.sort((a, b) => b[1].data.length - a[1].data.length);

		for (const [lookup] of files) {
			if (this.memory <= targetMemory) break;
			this.files.delete(lookup);
		}
	}

	/** Evict the oldest files until we are under the target count */
	pruneAge(targetCount = this.maxFileCount * 0.9) {
		if (this.files.size <= targetCount) return;

		const files = Array.from(this.files.entries());
		files.sort((a, b) => a[1].timestamp - b[1].timestamp);

		for (const [lookup] of files) {
			if (this.files.size <= targetCount) break;
			this.files.delete(lookup);
		}
	}

	/**
	 * Add a file to cache
	 * @param lookup
	 * @param data Buffer of the raw data
	 */
	add(lookup: SimpleFile['lookup'], data: Buffer) {
		if (data.length > this.maxMemory) throw new Error('File exceeds maximum allowed memory');

		if (this.memory + data.length > this.maxMemory) {
			this.pruneSize(this.maxMemory - data.length);
		}
		if (this.files.size >= this.maxFileCount) {
			this.pruneAge(this.files.size - this.maxFileCount + 1);
		}

		this.files.set(lookup, { data, timestamp: Date.now() });
		return true;
	}

	get(lookup: string) {
		const file = this.files.get(lookup);
		if (!file) return null;

		// refresh access timestamp
		file.timestamp = Date.now();

		return file.data;
	}

	has(lookup: string) {
		return this.files.has(lookup);
	}

	delete(lookup: string) {
		return this.files.delete(lookup);
	}

	clear() {
		this.files.clear();
	}
}