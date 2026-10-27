import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';

// 豆包音频生成（seed-audio-1.0）非流式接口
const VOLC_AUDIO_CREATE_URL = 'https://openspeech.bytedance.com/api/v3/tts/create';
const MODEL_NAME = 'seed-audio-1.0';

// 鉴权：新版控制台单 API Key 优先，否则退回旧版 App ID + Access Key
const VOLC_API_KEY = process.env.VOLC_API_KEY || '';
const VOLC_APP_ID = process.env.VOLC_APP_ID || '3952155908';
const VOLC_ACCESS_TOKEN = process.env.VOLC_ACCESS_TOKEN || 'gk141HY0oB44sIrT7HwycFUTL7JkgAkr';

interface SfxRequest {
  prompt: string;
  duration?: number; // 期望时长（秒），默认 3，上限 120
  outputFormat?: 'mp3' | 'wav' | 'pcm' | 'ogg_opus';
  loudnessRate?: number; // 音量 -50~100，默认 0
  imageUrl?: string; // 参考图片 URL（可选，走图片参考生成模式）
}

// 生成请求追踪 ID
function genRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 构建鉴权 headers
function buildAuthHeaders(requestId: string): Record<string, string> {
  const base: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Api-Request-Id': requestId,
  };
  if (VOLC_API_KEY) {
    base['X-Api-Key'] = VOLC_API_KEY;
  } else {
    base['X-Api-App-Id'] = VOLC_APP_ID;
    base['X-Api-Access-Key'] = VOLC_ACCESS_TOKEN;
  }
  return base;
}

// 将期望时长融入自然语言提示词（seed-audio-1.0 通过 text_prompt 控制总时长）
function buildTextPrompt(prompt: string, durationSec: number): string {
  const clean = prompt.trim();
  // 用户已显式描述时长则不重复追加
  if (/(\d+\s*(秒|s|sec|second)|时长|duration)/i.test(clean)) {
    return clean;
  }
  return `${clean}，音效时长约${durationSec}秒，纯净无杂音，结尾自然收束。`;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let body: SfxRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求参数格式错误' }, { status: 400 });
  }

  const { prompt } = body;
  if (!prompt?.trim()) {
    return NextResponse.json({ error: '请输入音效描述' }, { status: 400 });
  }

  // 参数收敛与边界保护
  const rawDuration = Number(body.duration);
  const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.min(Math.round(rawDuration), 120) : 3;
  const format = body.outputFormat === 'wav' || body.outputFormat === 'pcm' || body.outputFormat === 'ogg_opus'
    ? body.outputFormat
    : 'mp3';
  const rawLoudness = Number(body.loudnessRate);
  const loudnessRate = Number.isFinite(rawLoudness)
    ? Math.max(-50, Math.min(100, Math.round(rawLoudness)))
    : 0;

  // 参考图片校验：仅允许 http(s) URL
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
    return NextResponse.json({ error: '参考图片地址不合法' }, { status: 400 });
  }

  const requestId = genRequestId();
  const textPrompt = buildTextPrompt(prompt, duration);

  console.log('[SFX] 生成请求', {
    requestId,
    duration,
    format,
    hasImage: Boolean(imageUrl),
    prompt: prompt.slice(0, 80),
  });

  try {
    // 1. 调用豆包音频生成（非流式，同步返回 base64）
    const resp = await fetch(VOLC_AUDIO_CREATE_URL, {
      method: 'POST',
      headers: buildAuthHeaders(requestId),
      body: JSON.stringify({
        model: MODEL_NAME,
        text_prompt: textPrompt,
        ...(imageUrl ? { image_url: imageUrl } : {}),
        audio_config: {
          format,
          ...(format === 'mp3' ? { sample_rate: 44100 } : {}),
          loudness_rate: loudnessRate,
        },
      }),
    });

    const data = await resp.json();

    if (!resp.ok || (data.code !== undefined && data.code !== 0 && data.code !== 3000)) {
      const message = data.message || `音效生成失败（HTTP ${resp.status}）`;
      console.error('[SFX] 火山接口返回错误', { status: resp.status, code: data.code, message });
      return NextResponse.json({ error: message, code: data.code }, { status: 502 });
    }

    const audioBase64: string | undefined = data.audio;
    if (!audioBase64) {
      console.error('[SFX] 响应缺少音频数据', data);
      return NextResponse.json({ error: '音效生成失败：未返回音频数据' }, { status: 502 });
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // 2. 持久化到对象存储（接口返回的 url 仅 2 小时有效）
    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });

    const ext = format === 'ogg_opus' ? 'ogg' : format;
    const contentType = format === 'mp3'
      ? 'audio/mpeg'
      : format === 'wav'
        ? 'audio/wav'
        : format === 'ogg_opus'
          ? 'audio/ogg'
          : 'audio/L16';
    const fileName = `sfx/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const key = await storage.uploadFile({
      fileContent: audioBuffer,
      fileName,
      contentType,
    });
    const audioUrl = await storage.generatePresignedUrl({ key, expireTime: 604800 });

    const totalTime = Date.now() - startedAt;
    console.log('[SFX] 生成完成', {
      requestId,
      duration: data.duration,
      originalDuration: data.original_duration,
      bytes: audioBuffer.length,
      totalTime: `${totalTime}ms`,
    });

    return NextResponse.json({
      success: true,
      audioUrl,
      duration: data.duration ?? duration,
      originalDuration: data.original_duration ?? data.duration ?? duration,
      format,
      prompt,
      textPrompt,
    });
  } catch (err) {
    console.error('[SFX] 生成异常', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '音效生成失败' },
      { status: 500 },
    );
  }
}
