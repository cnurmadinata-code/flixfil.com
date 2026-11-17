import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { db } from './db.ts';

const execFileAsync = promisify(execFile);

export interface HlsTranscodeResult {
  masterPlaylistUrl: string;
  posterUrl: string;
  availableQualities: string[];
  durationSeconds: number;
}

export interface ProbedVideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  audioChannels: number;
  audioCodec: string;
  videoCodec: string;
}

interface QualityPreset {
  label: string;
  width: number;
  height: number;
  bitrate: string;
}

const QUALITY_PRESETS: QualityPreset[] = [
  { label: '144p', width: 256, height: 144, bitrate: '200k' },
  { label: '240p', width: 426, height: 240, bitrate: '400k' },
  { label: '360p', width: 640, height: 360, bitrate: '750k' },
  { label: '480p', width: 854, height: 480, bitrate: '1200k' },
  { label: '720p', width: 1280, height: 720, bitrate: '2400k' },
  { label: '1080p', width: 1920, height: 1080, bitrate: '4200k' },
];

export async function probeVideoDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const secs = Math.round(Number.parseFloat(stdout.trim()) || 0);
    return Number.isFinite(secs) ? secs : 0;
  } catch {
    return 0;
  }
}

export async function probeVideoMetadata(filePathOrUrl: string): Promise<ProbedVideoMetadata | null> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v', 'error',
        '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,channels',
        '-of', 'json',
        filePathOrUrl,
      ],
      { timeout: 8000 },
    );
    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
        channels?: number;
      }>;
    };
    const vStream = parsed.streams?.find((s) => s.codec_type === 'video');
    const aStream = parsed.streams?.find((s) => s.codec_type === 'audio');
    return {
      durationSeconds: Math.round(Number.parseFloat(parsed.format?.duration || '0') || 0),
      width: Number(vStream?.width || 0),
      height: Number(vStream?.height || 0),
      audioChannels: Number(aStream?.channels || 0),
      audioCodec: String(aStream?.codec_name || ''),
      videoCodec: String(vStream?.codec_name || ''),
    };
  } catch {
    return null;
  }
}

export async function transcodeVideoToMultiHls(
  inputPath: string,
  outDir: string,
  streamId: string,
  updateUploadRow = true,
): Promise<HlsTranscodeResult> {
  fs.mkdirSync(outDir, { recursive: true });
  const durationSeconds = await probeVideoDuration(inputPath);

  if (durationSeconds > 36000) {
    throw new Error('Durasi video melebihi batas maksimum 10 jam (36.000 detik).');
  }

  // Extract genuine frame thumbnail from video
  const posterPath = path.join(outDir, 'frame_poster.jpg');
  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', String(Math.min(5, Math.max(0, Math.floor(durationSeconds / 3)))),
      '-i', inputPath,
      '-vframes', '1',
      '-q:v', '3',
      posterPath,
    ]);
  } catch {
    // non-fatal
  }

  const meta = await probeVideoMetadata(inputPath);
  const sourceHeight = meta?.height || 1080;

  // Only transcode qualities up to the actual source resolution (never upscale fake resolutions!)
  const applicablePresets = QUALITY_PRESETS.filter((p) => p.height <= Math.max(sourceHeight, 360));
  const availableQualities: string[] = [];
  const masterLines: string[] = ['#EXTM3U', '#EXT-X-VERSION:3'];

  for (let i = 0; i < applicablePresets.length; i += 1) {
    const preset = applicablePresets[i];
    const qDir = path.join(outDir, preset.label);
    fs.mkdirSync(qDir, { recursive: true });

    await execFileAsync('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-vf', `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2`,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-b:v', preset.bitrate,
      '-c:a', 'aac',
      '-b:a', '96k',
      '-hls_time', '4',
      '-hls_playlist_type', 'vod',
      '-hls_segment_filename', path.join(qDir, 'seg_%04d.ts'),
      path.join(qDir, 'index.m3u8'),
    ]);

    availableQualities.push(preset.label);
    const bandwidth = Number.parseInt(preset.bitrate, 10) * 1000;
    masterLines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${preset.width}x${preset.height},NAME="${preset.label}"`,
      `${preset.label}/index.m3u8`,
    );

    if (updateUploadRow) {
      const pct = Math.round(((i + 1) / applicablePresets.length) * 100);
      db.prepare(`UPDATE upload_sessions SET transcode_progress = ? WHERE id = ?`).run(pct, streamId);
    }
  }

  fs.writeFileSync(path.join(outDir, 'master.m3u8'), masterLines.join('\n') + '\n', 'utf8');

  return {
    masterPlaylistUrl: `/streams/${streamId}/master.m3u8`,
    posterUrl: fs.existsSync(posterPath) ? `/streams/${streamId}/frame_poster.jpg` : '',
    availableQualities,
    durationSeconds,
  };
}
