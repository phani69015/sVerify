import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

export function s3ClientFromEnv(): S3Client {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    region: process.env.S3_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "sverify",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "sverify123",
    },
    forcePathStyle: true, // required for MinIO
  });
}

export const MEDIA_BUCKET = process.env.S3_MEDIA_BUCKET ?? "sverify-media";

export async function getObjectBuffer(client: S3Client, bucket: string, key: string): Promise<Buffer> {
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks: Uint8Array[] = [];
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function putObjectBuffer(
  client: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
  contentType?: string
): Promise<void> {
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}
