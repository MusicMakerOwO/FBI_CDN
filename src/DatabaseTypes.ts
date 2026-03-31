export type SimpleFile = {
	id: number;
	fileName: string;

	hash: string;
	lookup: string;

	/**
	 * The number of times this file can be (successfully) fetched or downloaded
	 * NULL = no limit
	 */
	download_limit: number | null;
	/** in bytes */
	size: number;
	/** ISO 8601 */
	created_at: string;
	/** ISO 8601 */
	access_at: string;
}