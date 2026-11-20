import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

// ffmpeg 二进制解析（不依赖安装期联网下载，避免构建沙箱无外网导致部署失败）
// 优先级：显式环境变量 FFMPEG_PATH -> 仓库内 vendor 二进制 -> 系统 ffmpeg
function resolveFfmpegPath(): string {
  const envPath = process.env.FFMPEG_PATH;
  if (envPath && existsSync(envPath)) return envPath;

  const candidates = [
    path.join(process.cwd(), 'vendor', 'ffmpeg-linux-x64'),
    path.join(process.cwd(), 'vendor', 'ffmpeg'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return 'ffmpeg';
}

const ffmpegPath: string = resolveFfmpegPath();

export interface SpeechRegion {
  start: number;
  end: number;
}

// 静态 ffmpeg 直接读网络 URL 会段错误，先把文件下载到临时目录再解码
async function downloadToTemp(inputUrl: string, dir: string): Promise<string> {
  // 尽量保留扩展名，便于 ffmpeg 识别容器
  const extMatch = inputUrl.split('?')[0].match(/\.[a-z0-9]{2,5}$/i);
  const filePath = path.join(dir, `input${extMatch ? extMatch[0].toLowerCase() : '.bin'}`);
  const res = await fetch(inputUrl);
  if (!res.ok) throw new Error(`下载文件失败: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(filePath, buf);
  return filePath;
}

// 用静态 ffmpeg 把本地音视频解码为单声道 16k s16le PCM
export function decodeToPCM(inputPath: string): Promise<{ pcm: Buffer; sampleRate: number }> {
  return new Promise((resolve, reject) => {
    const args = [
      '-nostdin',
      '-hide_banner',
      '-loglevel', 'error',
      '-i', inputPath,
      '-ac', '1',
      '-ar', '16000',
      '-f', 's16le',
      'pipe:1',
    ];
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => chunks.push(c));
    child.stderr.on('data', (c: Buffer) => { stderr += c.toString(); });
    child.on('error', reject);
    child.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg 解码失败(code=${code}): ${stderr.slice(0, 300)}`));
        return;
      }
      resolve({ pcm: Buffer.concat(chunks), sampleRate: 16000 });
    });
  });
}

// 基于帧能量的语音活动检测，返回真实说话区间（停顿/静音处不产生区间）
export function detectSpeechRegions(pcm: Buffer, sampleRate: number = 16000): SpeechRegion[] {
  const frameMs = 20;
  const frameSize = Math.floor(sampleRate * frameMs / 1000); // 每帧样本数
  const totalFrames = Math.floor(pcm.length / 2 / frameSize);
  if (totalFrames === 0) return [];

  // 1) 每帧 RMS
  const rms: number[] = new Array(totalFrames);
  for (let f = 0; f < totalFrames; f++) {
    let sumSq = 0;
    const base = f * frameSize * 2;
    for (let i = 0; i < frameSize; i++) {
      const s = pcm.readInt16LE(base + i * 2);
      sumSq += s * s;
    }
    rms[f] = Math.sqrt(sumSq / frameSize);
  }

  // 2) 自适应阈值：用排序后的能量分布估算噪声底与高能量
  const sorted = [...rms].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(totalFrames - 1, Math.floor(p * totalFrames))];
  const noiseFloor = pct(0.2);
  const high = pct(0.85);
  // 阈值取噪声底与高能量之间，并设置绝对下限，避免静音误判
  let threshold = noiseFloor + (high - noiseFloor) * 0.35;
  const minAbs = 250; // 16bit PCM 经验静音下限
  if (threshold < minAbs) threshold = Math.min(minAbs, high * 0.5);

  // 3) 能量 -> 语音帧标记
  const voiced: boolean[] = rms.map((e) => e >= threshold);

  // 4) 形态学平滑：填补短停顿（≤180ms），避免字间停顿切碎句子
  const maxSilenceFrames = Math.round(180 / frameMs);
  let i = 0;
  while (i < totalFrames) {
    if (!voiced[i]) {
      let j = i;
      while (j < totalFrames && !voiced[j]) j++;
      const gap = j - i;
      const hasVoicedBefore = i > 0 && voiced[i - 1];
      const hasVoicedAfter = j < totalFrames && voiced[j];
      if (gap <= maxSilenceFrames && hasVoicedBefore && hasVoicedAfter) {
        for (let k = i; k < j; k++) voiced[k] = true;
      }
      i = j;
    } else {
      i++;
    }
  }

  // 5) 聚合连续语音帧为区间；过滤过短噪声（<120ms）
  const minVoicedFrames = Math.round(120 / frameMs);
  const regions: SpeechRegion[] = [];
  let startFrame = -1;
  for (let f = 0; f <= totalFrames; f++) {
    const isVoiced = f < totalFrames && voiced[f];
    if (isVoiced && startFrame === -1) {
      startFrame = f;
    } else if (!isVoiced && startFrame !== -1) {
      const endFrame = f;
      if (endFrame - startFrame >= minVoicedFrames) {
        regions.push({
          start: parseFloat(((startFrame * frameMs) / 1000).toFixed(3)),
          end: parseFloat(((endFrame * frameMs) / 1000).toFixed(3)),
        });
      }
      startFrame = -1;
    }
  }
  return regions;
}

// 直接从 URL 检测说话区间（先下载到临时目录，解码后清理）
export async function detectSpeechFromUrl(inputUrl: string): Promise<SpeechRegion[]> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vad-'));
  try {
    const inputPath = await downloadToTemp(inputUrl, dir);
    const { pcm, sampleRate } = await decodeToPCM(inputPath);
    return detectSpeechRegions(pcm, sampleRate);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export interface TimedText {
  text: string;
}

// 把识别出的句子按字符量对齐到真实说话区间：
// - 句子按总字符数映射到全部说话区间拼接成的“说话时间轴”，停顿/静音不占用时间
// - 句子多于区间时，一个区间内可容纳多句（首尾相接）
// - 句子少于区间时，多出的区间并入最后一句，避免丢失内容
export function alignSentencesToRegions<T extends TimedText>(sentences: T[], regions: SpeechRegion[]): Array<T & { start: number; end: number }> {
  if (sentences.length === 0) return [];
  if (regions.length === 0) {
    // 检测不到区间时无法定位，退化给上层处理（通常表示无有效语音）
    return sentences.map((s) => ({ ...s, start: 0, end: 0 }));
  }

  const totalSpeech = regions.reduce((sum, r) => sum + (r.end - r.start), 0) || 1;
  const totalChars = sentences.reduce((sum, s) => sum + Math.max(1, s.text.length), 0);

  // 计算“说话时间轴”上的相对偏移 -> 绝对时间
  const mapOffsetToAbsolute = (offset: number): { time: number; regionIndex: number } => {
    let remaining = Math.max(0, Math.min(offset, totalSpeech));
    for (let i = 0; i < regions.length; i++) {
      const dur = regions[i].end - regions[i].start;
      if (remaining <= dur || i === regions.length - 1) {
        return { time: regions[i].start + Math.min(remaining, dur), regionIndex: i };
      }
      remaining -= dur;
    }
    return { time: regions[regions.length - 1].end, regionIndex: regions.length - 1 };
  };

  // 句子边界落在说话轴上的偏移
  let charCursor = 0;
  const bounds = sentences.map((s) => {
    const startOffset = (charCursor / totalChars) * totalSpeech;
    charCursor += Math.max(1, s.text.length);
    const endOffset = (charCursor / totalChars) * totalSpeech;
    return { startOffset, endOffset };
  });

  return sentences.map((s, i) => {
    const start = mapOffsetToAbsolute(bounds[i].startOffset).time;
    let end: number;
    if (i === sentences.length - 1) {
      // 最后一句延伸到最后一个说话区间结束
      end = regions[regions.length - 1].end;
    } else {
      end = mapOffsetToAbsolute(bounds[i].endOffset).time;
    }
    // 防御零时长：至少落在所属区间内
    if (end <= start) {
      end = start + 0.001;
    }
    return {
      ...s,
      start: parseFloat(start.toFixed(3)),
      end: parseFloat(end.toFixed(3)),
    };
  });
}