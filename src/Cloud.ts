import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { customAlphabet } from 'nanoid'
import { DeriveContentType } from "./ContentType";

// Birthday problem visualizer: https://zelark.github.io/nano-id-cc/
// This will require about ~30 trillion IDs for a 1% collision chance
const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 16);

let r2: S3Client | null = null;

function ManifestClient(): S3Client {
	if (r2) return r2;

	if (!process.env.R2_ACCESS_KEY || !process.env.R2_SECRET_KEY) {
		throw new Error('Missing R2_ACCESS_KEY or R2_SECRET_KEY, check your env!');
	}

	r2 = new S3Client({
		region: 'auto',
		endpoint: `https://91fd6bf8d0f838ea2ab6ba9cdf9c12f3.r2.cloudflarestorage.com`,
		credentials: {
			accessKeyId: process.env.R2_ACCESS_KEY!,
			secretAccessKey: process.env.R2_SECRET_KEY!
		},
	});

	return r2;
}

// TODO: Remove keyOverride after migration
export async function Upload(fileName: string, content: Buffer, keyOverride?: string) {
	// TODO: Finalize migration
	// const hash = createHash('sha256').update(content).digest('hex');
	// const existingKey = await Database.query('SELECT `key` FROM CDN WHERE hash = ?', [hash]).then(x => x[0]?.key) as string | undefined;
	// if (existingKey) return existingKey;

	const key = keyOverride ?? nanoid();
	const type = DeriveContentType(fileName);

	await ManifestClient().send(new PutObjectCommand({
		Bucket: 'fbi-cdn',
		Key: key,
		Body: content,
		ContentType: type,
	}));

	// TODO: Finalize migration
	// await Database.query('INSERT INTO CDN (`key`, `hash`, `fileName`, `type`, `location`) VALUES (?, ?, ?, ?, ?)', [key, hash, fileName, type, 'cloud']);

	return key;
}

export async function Delete(key: string) {
	return await ManifestClient().send(new DeleteObjectCommand({
		Bucket: 'fbi-cdn',
		Key: key
	}))
}

export async function Fetch(key: string) {
	const url = `https://91fd6bf8d0f838ea2ab6ba9cdf9c12f3.r2.cloudflarestorage.com/fbi-cdn/${key}`;
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Failed to fetch file from R2 with key ${key}: ${response.status} ${response.statusText}`);
	return await response.arrayBuffer();
}

export function destroy() {
	r2?.destroy();
	r2 = null;
}