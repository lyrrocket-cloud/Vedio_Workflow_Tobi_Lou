import { NextRequest, NextResponse } from 'next/server';
import { ASRClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

interface SubtitleSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

function log(stage: string, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [TRANSCRIBE] [${stage}] ${message}`, data ? JSON.stringify(data).slice(0, 500) : '');
}

function formatTimeSRT(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function formatTimeFCPXML(seconds: number, frameRate: number): string {
  if (frameRate === 23.976 || frameRate === 24) {
    const frames = Math.round(seconds * 24000 / 1001);
    return `${frames}/24000s`;
  } else if (frameRate === 25) {
    const frames = Math.round(seconds * 25);
    return `${frames}/25s`;
  } else if (frameRate === 29.97 || frameRate === 30) {
    const frames = Math.round(seconds * 30000 / 1001);
    return `${frames}/30000s`;
  } else if (frameRate === 59.94 || frameRate === 60) {
    const frames = Math.round(seconds * 60000 / 1001);
    return `${frames}/60000s`;
  }
  const frames = Math.round(seconds * frameRate);
  return `${frames}/${frameRate}s`;
}

function getFrameDuration(frameRate: number): string {
  if (frameRate === 23.976 || frameRate === 24) {
    return '1001/24000s';
  } else if (frameRate === 25) {
    return '1/25s';
  } else if (frameRate === 29.97 || frameRate === 30) {
    return '1001/30000s';
  } else if (frameRate === 59.94 || frameRate === 60) {
    return '1001/60000s';
  }
  return `1/${frameRate}s`;
}

export function generateSRT(segments: SubtitleSegment[]): string {
  return segments.map(seg => `${seg.id}\n${formatTimeSRT(seg.start)} --> ${formatTimeSRT(seg.end)}\n${seg.text}\n`).join('\n');
}

export function generateFCPXML(segments: SubtitleSegment[], frameRate: number = 30): string {
  const totalDuration = segments.length > 0 
    ? formatTimeFCPXML(segments[segments.length - 1].end + 1, frameRate)
    : frameRate === 23.976 || frameRate === 24 ? '0/24000s' 
      : frameRate === 25 ? '0/25s'
      : frameRate === 59.94 || frameRate === 60 ? '0/60000s'
      : '0/30000s';

  const frameDuration = getFrameDuration(frameRate);
  const formatName = frameRate === 24 ? 'FFVideoFormat1080p24' : 
                    frameRate === 25 ? 'FFVideoFormat1080p25' :
                    frameRate === 60 ? 'FFVideoFormat1080p60' : 'FFVideoFormat1080p30';

  const titleItems = segments.map(seg => {
    const start = formatTimeFCPXML(seg.start, frameRate);
    const duration = formatTimeFCPXML(seg.end - seg.start, frameRate);
    const escapedText = seg.text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
    return `
            <title name="字幕 ${seg.id}" lane="1" offset="${start}" ref="r2" duration="${duration}">
                <text>${escapedText}</text>
            </title>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml SYSTEM "FCPXML_1_10.dtd">
<fcpxml version="1.10">
    <resources>
        <format id="r1" name="${formatName}" frameDuration="${frameDuration}" width="1920" height="1080"/>
        <effect id="r2" name="Basic Title" uid=".../Titles.localized/Bumper:Opener.localized/Basic Title.localized/Basic Title.moti"/>
    </resources>
    <library>
        <event name="字幕项目">
            <project name="字幕序列">
                <sequence format="r1" duration="${totalDuration}" tcStart="0s" tcFormat="NDF">
                    <spine>
                        <gap name="Background" offset="0s" start="0s" duration="${totalDuration}">${titleItems}
                        </gap>
                    </spine>
                </sequence>
            </project>
        </event>
    </library>
</fcpxml>`;
}

/**
 * 将整段文本按中文/英文句子分割为多条
 */
function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s*([。！？!?；;])\s*/g, '$1\n').replace(/([，,])\s*/g, '$1\n');
  return normalized
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 兼容 SDK 多种响应结构（utterances 在顶层 / result 下 / rawData 下）
 */
function parseASRResult(data: Record<string, unknown>): SubtitleSegment[] {
  const result: SubtitleSegment[] = [];
  
  try {
    const raw = data.rawData as Record<string, unknown> | undefined;
    const resultData = (data.result as Record<string, unknown>) || ((raw?.result as Record<string, unknown>) || {});
    const utterances = (data.utterances as unknown[]) || (resultData.utterances as unknown[]) || [];
    
    if (Array.isArray(utterances) && utterances.length > 0) {
      utterances.forEach((u, index) => {
        const utterance = u as Record<string, unknown>;
        const startTime = typeof utterance.start_time === 'number' ? utterance.start_time / 1000 : index * 3;
        const endTime = typeof utterance.end_time === 'number' ? utterance.end_time / 1000 : startTime + 2;
        const text = utterance.text || '';
        
        if (text && typeof text === 'string') {
          result.push({
            id: index + 1,
            start: parseFloat(startTime.toFixed(3)),
            end: parseFloat(endTime.toFixed(3)),
            text: String(text).trim(),
          });
        }
      });
    }
    
    if (result.length === 0) {
      const text = (data.text as string) || String(resultData.text || '');
      if (text) {
        const audioInfo = ((data.audio_info || raw?.audio_info) as Record<string, unknown>) || {};
        const durationMs =
          typeof audioInfo.duration === 'number'
            ? audioInfo.duration
            : typeof data.duration === 'number'
              ? data.duration
              : 0;
        const duration = durationMs / 1000;
        // 无逐句时间戳时，按句子切分，并按字符数比例分配时长
        const sentences = splitSentences(String(text));
        if (!duration || sentences.length <= 1) {
          result.push({ id: 1, start: 0, end: duration || 3, text: String(text) });
        } else {
          const totalChars = sentences.reduce((sum, s) => sum + s.length, 0) || 1;
          let cursor = 0;
          sentences.forEach((sent, i) => {
            const ratio = Math.max(sent.length / totalChars, 0);
            const segDur = ratio * duration;
            const end = i === sentences.length - 1 ? duration : Math.min(duration, cursor + segDur);
            const trimmed = sent.trim();
            if (trimmed) {
              result.push({
                id: result.length + 1,
                start: parseFloat(cursor.toFixed(3)),
                end: parseFloat(end.toFixed(3)),
                text: trimmed,
              });
            }
            cursor = end;
          });
        }
      }
    }
  } catch (e) {
    log('PARSE_ERROR', '解析ASR结果失败', { error: String(e) });
  }
  
  return result.length > 0 ? result : [];
}

/**
 * 使用 coze-coding-dev-sdk 内置 ASRClient 进行语音识别
 * 使用平台托管凭证（已授权），不依赖用户账户单独开通火山资源
 */
async function transcribeWithASR(fileUrl: string, requestHeaders: Headers): Promise<SubtitleSegment[]> {
  log('ASR_START', 'SDK ASR 语音识别', { url: fileUrl.slice(0, 80) + '...' });
  
  const customHeaders = HeaderUtils.extractForwardHeaders(requestHeaders);
  const config = new Config();
  const client = new ASRClient(config, customHeaders);
  
  try {
    const result = await client.recognize({ uid: 'videoworkflow', url: fileUrl });
    log('ASR_SUCCESS', 'SDK ASR 识别成功', {
      textLen: (result.text || '').length,
      utterances: Array.isArray(result.utterances) ? result.utterances.length : 0,
    });
    return parseASRResult(result as unknown as Record<string, unknown>);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log('ASR_ERROR', 'SDK ASR 识别失败', { error: msg.slice(0, 300) });
    // "无有效语音"属于正常业务结果，返回空字幕
    if (msg.includes('no valid speech') || msg.includes('20000003')) {
      return [];
    }
    throw new Error(`语音识别失败: ${msg}`);
  }
}

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes timeout
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  log('REQUEST', '收到字幕生成请求', { contentType: request.headers.get('content-type') });
  
  try {
    const contentType = request.headers.get('content-type') || '';
    let format = 'srt';
    let frameRate = 30;
    let videoUrl: string | null = null;
    
    if (contentType.includes('multipart/form-data')) {
      try {
        const formData = await request.formData();
        format = (formData.get('format') as string) || 'srt';
        frameRate = parseInt((formData.get('frameRate') as string) || '30', 10);
        videoUrl = formData.get('videoUrl') as string | null;
        log('FORMDATA_PARSED', 'FormData解析成功', { format, frameRate, hasVideoUrl: !!videoUrl });
      } catch (e) {
        log('FORMDATA_ERROR', 'FormData解析失败', { error: String(e) });
        return NextResponse.json({ success: false, error: 'FormData解析失败，请重试' }, { status: 400 });
      }
    } else if (contentType.includes('application/json')) {
      const body = await request.json();
      videoUrl = body.videoUrl || null;
      format = body.format || 'srt';
      frameRate = body.frameRate || 30;
      log('JSON_PARSED', 'JSON解析成功', { hasVideoUrl: !!videoUrl, format, frameRate });
    } else {
      log('CONTENT_TYPE_ERROR', '不支持的Content-Type', { contentType });
      return NextResponse.json({ success: false, error: `不支持的Content-Type: ${contentType}` }, { status: 400 });
    }
    
    if (!videoUrl) {
      return NextResponse.json(
        { success: false, error: '请提供文件URL' },
        { status: 400 }
      );
    }

    // 使用 SDK ASRClient 转写（平台托管凭证，直接支持视频和音频格式）
    log('TRANSCRIBE_START', '开始转写（SDK ASR，无需FFmpeg）', { format, frameRate });
    
    const segments = await transcribeWithASR(videoUrl, request.headers);
    
    let content: string;
    let responseContentType: string;
    let downloadName: string;
    
    if (format === 'fcpxml') {
      content = generateFCPXML(segments, frameRate);
      responseContentType = 'application/xml';
      downloadName = `subtitle_${Date.now()}.fcpxml`;
    } else {
      content = generateSRT(segments);
      responseContentType = 'text/plain; charset=utf-8';
      downloadName = `subtitle_${Date.now()}.srt`;
    }
    
    const totalTime = Date.now() - startTime;
    log('COMPLETE', '转写完成', { totalTime: `${totalTime}ms`, segments: segments.length, format });
    
    return NextResponse.json({
      success: true,
      segments,
      format,
      content,
      contentType: responseContentType,
      downloadName,
      frameRate: format === 'fcpxml' ? frameRate : undefined,
      duration: segments.length > 0 ? segments[segments.length - 1].end : 0,
      warning: segments.length === 0 ? '未检测到语音内容，请确认文件中包含有效语音' : undefined,
    });
    
  } catch (error) {
    const totalTime = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : '转写失败，请重试';
    const errorStack = error instanceof Error ? error.stack : '';
    log('ERROR', '转写失败', { totalTime: `${totalTime}ms`, error: errorMsg, stack: errorStack });
    console.error('[TRANSCRIBE] Fatal error:', errorMsg, errorStack);
    
    try {
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status: 500 }
      );
    } catch {
      return new NextResponse(JSON.stringify({ success: false, error: errorMsg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
}
