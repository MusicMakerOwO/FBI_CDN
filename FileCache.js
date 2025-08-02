const SIZE = {
	BYTE: 1,
	KILOBYTE: 1024,
	MEGABYTE: 1024 * 1024,
	GIGABYTE: 1024 * 1024 * 1024
}

const TIME = {
	SECOND: 1000,
	MINUTE: 1000 * 60,
	HOUR: 1000 * 60 * 60,
	DAY: 1000 * 60 * 60 * 24,
	WEEK: 1000 * 60 * 60 * 24 * 7,
	MONTH: 1000 * 60 * 60 * 24 * 30,
	YEAR: 1000 * 60 * 60 * 24 * 365
}

const DEFAULT_OPTIONS = {
	maxFileCount: 1000,
	maxMemory: SIZE.GIGABYTE,
}

module.exports = class FileCache {
	constructor(options = DEFAULT_OPTIONS) {
		this.maxFileCount = options.maxFileCount || DEFAULT_OPTIONS.maxFileCount;
		this.maxMemory = options.maxMemory || DEFAULT_OPTIONS.maxMemory;
		this.files = new Map(); // path -> { data, timestamp }

		this.memory = 0;
	}

	pruneSize(targetMemory = this.maxMemory * 0.9) {
		if (this.memory <= targetMemory) return;
		// evict the largest files until we are under the target memory
		const files = Array.from(this.files.entries());
		files.sort((a, b) => b[1].data.length - a[1].data.length);
		for (const file of files) {
			if (this.memory <= targetMemory) break;
			this.memory -= file[1].data.length;
			this.files.delete(file[0]);
		}
	}

	pruneAge(targetCount = this.maxFileCount * 0.9) {
		if (this.files.size <= targetCount) return;
		// evict the oldest files until we are under the target count
		const files = Array.from(this.files.entries());
		files.sort((a, b) => a[1].timestamp - b[1].timestamp);
		for (const file of files) {
			if (this.files.size <= targetCount) break;
			this.memory -= file[1].data.length;
			this.files.delete(file[0]);
		}
	}

	add(path, data = Buffer.from('')) {
		if (data.length > this.maxMemory) return false;
		if (this.memory + data.length > this.maxMemory) {
			this.pruneSize(this.maxMemory - data.length);
		}
		if (this.files.size >= this.maxFileCount) {
			this.pruneAge(this.files.size - this.maxFileCount + 1);
		}
		this.memory += data.length;
		this.files.set(path, { data, timestamp: Date.now() });
		return true;
	}

	get(path) {
		const file = this.files.get(path);
		if (!file) return null;
		file.timestamp = Date.now();
		this.files.set(path, file); // update timestamp
		return file.data;
	}

	has(path) {
		return this.files.has(path);
	}

	delete(path) {
		const file = this.files.get(path);
		if (!file) return false;
		this.memory -= file.data.length;
		return this.files.delete(path);
	}

	clear() {
		this.files.clear();
		this.memory = 0;
	}

	get size() {
		return this.files.size;
	}
}