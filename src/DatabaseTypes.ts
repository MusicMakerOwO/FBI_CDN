export type SimpleFile = {
	fileName: string;
	type: string;
	hash: string;
	key: string;
	location: 'local' | 'cloud';
}