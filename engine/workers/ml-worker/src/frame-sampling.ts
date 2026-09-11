import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

const FRAME_COUNT = 8; // how many sampled frames to send, evenly spaced across the video
const FRAME_MAX_WIDTH = 320; // px - downscaled, since the model only needs a rough frame, not full resolution

/**
 * Samples a handful of evenly-spaced, downscaled JPEG frames from a video
 * instead of sending the whole file anywhere. This is what keeps the
 * deepfake-detection request small: a few tiny frames instead of the entire
 * (often tens-of-MB) video.
 */
export async function sampleFrames(videoPath: string): Promise<Buffer[]> {
  const frameDir = await mkdtemp(join(tmpdir(), "sverify-frames-"));

  try {
    const duration = await getDurationSeconds(videoPath);
    const interval = Math.max(duration / FRAME_COUNT, 0.5); // seconds between sampled frames

    await execFileAsync("ffmpeg", [
      "-y",
      "-i", videoPath,
      "-vf", `fps=1/${interval},scale=${FRAME_MAX_WIDTH}:-1`,
      "-vframes", String(FRAME_COUNT),
      "-q:v", "4",
      join(frameDir, "frame_%02d.jpg"),
    ]);

    const files = (await readdir(frameDir)).filter((f) => f.startsWith("frame_")).sort();
    return await Promise.all(files.map((f) => readFile(join(frameDir, f))));
  } finally {
    await rm(frameDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function getDurationSeconds(videoPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      videoPath,
    ]);
    const duration = parseFloat(stdout.trim());
    return Number.isFinite(duration) && duration > 0 ? duration : FRAME_COUNT;
  } catch {
    return FRAME_COUNT; // fall back to ~1 frame/sec if ffprobe fails for any reason
  }
}
