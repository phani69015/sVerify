import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@temporalio/activity";
import { s3ClientFromEnv, getObjectBuffer, MEDIA_BUCKET, hfClientFromEnv } from "@sverify/clients";
import type { TranscriptResult } from "@sverify/schemas";
import { mockTranscript } from "@sverify/mocks";

const execFileAsync = promisify(execFile);
const s3 = s3ClientFromEnv();

interface HfWhisperResponse {
  text: string;
  language?: string;
}

/**
 * Extracts the audio track from the video (ffmpeg) then sends it to the
 * Whisper large-v3-turbo Hugging Face Inference Endpoint for transcription.
 * Any real-world failure (no audio track, ffmpeg error, endpoint error)
 * degrades to an empty transcript rather than failing the whole pipeline.
 */
export async function transcribeAudio(input: { videoKey: string; mock: boolean }): Promise<TranscriptResult> {
  if (input.mock) return mockTranscript();

  const videoPath = join(tmpdir(), `${randomUUID()}.mp4`);
  const audioPath = join(tmpdir(), `${randomUUID()}.wav`);

  try {
    Context.current().heartbeat("downloading video");
    const videoBuffer = await getObjectBuffer(s3, MEDIA_BUCKET, input.videoKey);
    await writeFile(videoPath, videoBuffer);

    Context.current().heartbeat("extracting audio via ffmpeg");
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", videoPath,
      "-vn",
      "-acodec", "pcm_s16le",
      "-ar", "16000",
      "-ac", "1",
      audioPath,
    ]);

    Context.current().heartbeat("calling HF whisper endpoint");
    const audioBuffer = await readFile(audioPath);
    const client = hfClientFromEnv("HF_WHISPER_ENDPOINT_URL");
    const response = await client.postBinary<HfWhisperResponse>(audioBuffer, "audio/wav");

    return { text: response.text, language: response.language ?? null };
  } catch {
    return { text: "", language: null };
  } finally {
    await unlink(videoPath).catch(() => undefined);
    await unlink(audioPath).catch(() => undefined);
  }
}
