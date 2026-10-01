import { NextRequest, NextResponse } from 'next/server';
import { ASRClient, Config } from 'coze-coding-dev-sdk';
import { detectSpeechFromUrl, alignSentencesToRegions } from '@/lib/vad';

interface SubtitleSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

const VOLC_APP_ID = process.env.VOLC_APP_ID || '3952155908';
const VOLC_ACCESS_TOKEN = process.env.VOLC_ACCESS_TOKEN || 'gk141HY0oB44sIrT7HwycFUTL7JkgAkr';
const VOLC_RESOURCE_ID = process.env.VOLC_RESOURCE_ID || 'volc.bigasr.auc';
// 火山录音文件识别资源漫游列表：按顺序尝试，直到某资源授权成功
const VOLC_RESOURCES = (process.env.VOLC_RESOURCES || 'volc.bigasr.auc,volc.seedasr.auc')
  .split(',').map((s: string) => s.trim()).filter(Boolean);
const VOLC_BASE_URL = process.env.VOLC_BASE_URL || 'https://openspeech.bytedance.com/api/v3/auc/bigmodel';

function log(stage: string, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [TRANSCRIBE] [${stage}] ${message}`, data ? JSON.stringify(data).slice(0, 500) : '');
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
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
 * 获取 ASR API 支持的音频/视频格式
 * 火山引擎 ASR API 直接支持视频文件（mp4/mov 等），无需 FFmpeg 提取音频
 */
function getMediaFormat(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const formatMap: Record<string, string> = {
    // 音频格式
    'mp3': 'mp3',
    'wav': 'wav',
    'ogg': 'ogg',
    'opus': 'opus',
    'raw': 'raw',
    'm4a': 'mp4',
    'aac': 'aac',
    'flac': 'flac',
    'amr': 'amr',
    'wma': 'wma',
    // 视频格式（ASR API 直接支持，自动提取音频轨道）
    'mp4': 'mp4',
    'mov': 'mov',
    'avi': 'avi',
    'mkv': 'mkv',
    'webm': 'webm',
    'flv': 'flv',
    'wmv': 'wmv',
    'm4v': 'mp4',
    '3gp': '3gp',
    'ts': 'ts',
    'mts': 'mts',
  };
  return formatMap[ext] || 'mp4';
}

function parseASRResult(data: Record<string, unknown>): SubtitleSegment[] {
  const result: SubtitleSegment[] = [];
  
  try {
    const resultData = data.result as Record<string, unknown> || {};
    const utterances = resultData.utterances;
    
    if (Array.isArray(utterances) && utterances.length > 0) {
      utterances.forEach((utterance: Record<string, unknown>, index: number) => {
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
      const text = resultData.text || data.text || '';
      if (text) {
        const audioInfo = data.audio_info as Record<string, unknown> || {};
        const duration = typeof audioInfo.duration === 'number' ? audioInfo.duration / 1000 : 30;
        result.push({ id: 1, start: 0, end: duration, text: String(text) });
      }
    }
  } catch (e) {
    log('PARSE_ERROR', '解析ASR结果失败', { error: String(e) });
  }
  
  return result.length > 0 ? result : [];
}

async function submitASRTask(fileUrl: string, fileName: string, requestId: string, resourceId: string): Promise<void> {
  const submitUrl = `${VOLC_BASE_URL}/submit`;
  const format = getMediaFormat(fileName);
  
  const requestBody = {
    user: {
      uid: VOLC_APP_ID,
    },
    audio: {
      format: format,
      url: fileUrl,
    },
    request: {
      model_name: 'bigmodel',
      enable_itn: true,
      enable_punc: true,
      show_utterances: true,
    },
  };

  log('SUBMIT_REQUEST', '提交ASR任务', {
    url: submitUrl,
    requestId,
    format,
    resourceId,
    audioUrl: fileUrl.slice(0, 80) + '...',
  });

  const response = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-App-Key': VOLC_APP_ID,
      'X-Api-Access-Key': VOLC_ACCESS_TOKEN,
      'X-Api-Resource-Id': resourceId,
      'X-Api-Request-Id': requestId,
      'X-Api-Sequence': '-1',
    },
    body: JSON.stringify(requestBody),
  });

  const logId = response.headers.get('X-Tt-Logid') || '';
  const statusCode = response.headers.get('X-Api-Status-Code') || '';
  const message = response.headers.get('X-Api-Message') || '';
  
  log('SUBMIT_RESPONSE', '提交任务响应', {
    status: response.status,
    logId,
    statusCode,
    message,
  });

  if (!response.ok) {
    const errorText = await response.text();
    log('SUBMIT_ERROR', '提交ASR任务失败', {
      status: response.status,
      statusCode,
      message,
      error: errorText.slice(0, 500),
    });
    throw new Error(`提交ASR任务失败: ${statusCode} - ${message}`);
  }

  if (statusCode && statusCode !== '20000000') {
    throw new Error(`提交ASR任务失败: ${statusCode} - ${message}`);
  }
  
  const responseBody = await response.text();
  log('SUBMIT_BODY', '提交任务响应体', { body: responseBody.slice(0, 200) });
}

async function queryASRResult(requestId: string, resourceId: string): Promise<{ status: string; segments?: SubtitleSegment[]; error?: string }> {
  const queryUrl = `${VOLC_BASE_URL}/query`;

  log('QUERY_REQUEST', '查询ASR结果', {
    url: queryUrl,
    requestId,
  });

  const response = await fetch(queryUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-App-Key': VOLC_APP_ID,
      'X-Api-Access-Key': VOLC_ACCESS_TOKEN,
      'X-Api-Resource-Id': resourceId,
      'X-Api-Request-Id': requestId,
    },
    body: JSON.stringify({}),
  });

  const logId = response.headers.get('X-Tt-Logid') || '';
  const statusCode = response.headers.get('X-Api-Status-Code') || '';
  const message = response.headers.get('X-Api-Message') || '';

  const data = await response.json();
  log('QUERY_RESPONSE', '查询结果响应', {
    status: response.status,
    logId,
    statusCode,
    message,
    data: JSON.stringify(data).slice(0, 500),
  });

  if (statusCode === '20000000') {
    const segments = parseASRResult(data as Record<string, unknown>);
    log('QUERY_SUCCESS', 'ASR任务完成', { segments: segments.length });
    return { status: 'succeeded', segments };
  } else if (statusCode === '20000001' || statusCode === '20000002') {
    log('QUERY_RUNNING', 'ASR任务处理中', { statusCode, message });
    return { status: 'running' };
  } else {
    log('QUERY_FAILED', 'ASR任务失败', { statusCode, message });
    // "无有效语音"属于正常业务结果，不视为服务错误
    if (message && message.includes('no valid speech')) {
      return { status: 'succeeded', segments: [] };
    }
    // 资源未授权/不可用：抛出特定错误让上层漫游到下一个资源
    if (statusCode === '45000030' || statusCode === '45000000' || message?.includes('resource not granted') || message?.includes('is not allowed')) {
      return { status: 'resource_locked', error: message || `错误码: ${statusCode}` };
    }
    return { status: 'failed', error: message || `错误码: ${statusCode}` };
  }
}

// 按中文/英文标点切句，空句子会被合并到前一句
// 注意：必须使用无副作用且不会死循环的分割方式（禁止 exec 空匹配循环）
function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // 在每组结束标点（含中文句读）之后切分，保持标点留在句子末尾
  const parts = trimmed.split(/(?<=[。！？；;!?])/);
  const sentences = parts.map((s) => s.trim()).filter((s) => s.length > 0);
  if (sentences.length > 0) return sentences;
  return [trimmed];
}

// 兜底通道：平台 flash ASR（始终授权）拿全文 + ffmpeg-static 做能量 VAD 得到真实说话区间，
// 再把句子对齐到说话区间——停顿/无对话处不产生字幕
async function transcribeWithPlatformFallback(fileUrl: string): Promise<SubtitleSegment[]> {
  log('FALLBACK_START', '火山资源均未授权，回退到平台集成ASR+VAD');
  let text = '';
  try {
    const cfg = new Config();
    const client = new ASRClient(cfg);
    const result = await client.recognize({ uid: 'videoworkflow', url: fileUrl });
    text = (result.text || '').trim();
    log('FALLBACK_RESULT', '平台ASR识别完成', { textLen: text.length });
    if (!text) return [];
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log('FALLBACK_ERROR', '平台ASR失败', { error: msg.slice(0, 300) });
    if (msg.includes('no valid speech') || msg.includes('20000003')) {
      return [];
    }
    throw new Error(`语音识别失败: ${msg}`);
  }

  const sentences = splitSentences(text);

  try {
    log('VAD_START', '开始检测真实说话区间');
    const regions = await detectSpeechFromUrl(fileUrl);
    log('VAD_RESULT', '说话区间检测完成', { regions: regions.length });
    if (regions.length === 0) {
      // 无任何说话区间：按无有效语音处理
      return [];
    }
    const aligned = alignSentencesToRegions(sentences.map((s) => ({ text: s })), regions);
    return aligned.map((seg, i) => ({ id: i + 1, start: seg.start, end: seg.end, text: seg.text }));
  } catch (vadError) {
    const vadMsg = vadError instanceof Error ? vadError.message : String(vadError);
    log('VAD_ERROR', 'VAD检测失败，无法定位真实时间', { error: vadMsg.slice(0, 300) });
    // VAD 失败时无法确定真实说话时间，直接报错而非生成与视频不匹配的字幕
    throw new Error(`无法定位语音时间，请确认文件可正常播放：${vadMsg}`);
  }
}

async function transcribeWithVolcSpeech(fileUrl: string, fileName: string): Promise<SubtitleSegment[]> {
  log('VOLC_TRANSCRIBE', '使用火山引擎录音文件识别', { fileName, resources: VOLC_RESOURCES });
  
  let lastResourceError: string | null = null;
  
  for (const resourceId of VOLC_RESOURCES) {
    log('RESOURCE_TRY', '尝试ASR资源', { resourceId });
    const requestId = generateUUID();
    try {
      await submitASRTask(fileUrl, fileName, requestId, resourceId);
      log('POLLING_START', '开始轮询ASR结果', { requestId, resourceId });
      
      const maxWaitTime = 300;
      const pollInterval = 3000;
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime * 1000) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        const result = await queryASRResult(requestId, resourceId);
        if (result.status === 'succeeded') {
          return result.segments || [];
        } else if (result.status === 'resource_locked') {
          lastResourceError = result.error || 'resource not granted';
          break; // 该资源未授权，尝试下一个
        } else if (result.status === 'failed') {
          throw new Error(result.error || 'ASR转写失败');
        }
      }
      // 若循环里因 resource_locked 跳出，则继续尝试下一个资源
      if (Date.now() - startTime >= maxWaitTime * 1000) {
        throw new Error('ASR转写超时，请稍后重试');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('no valid speech')) {
        return [];
      }
      if (errorMsg.includes('45000030') || errorMsg.includes('resource not granted') || errorMsg.includes('45000000') || errorMsg.includes('is not allowed')) {
        lastResourceError = errorMsg;
        log('RESOURCE_SKIP', '资源不可用，切换下一个', { resourceId, errorMsg });
        continue; // 切换下一个资源
      }
      // 其他错误直接抛出（如超时、无有效语音等）
      throw error;
    }
  }
  
  // 所有资源都未授权：回退到平台集成ASR（保证可用），无逐句时间戳则按比例切分
  log('ALL_RESOURCE_LOCKED', '所有火山资源未授权', { lastResourceError });
  const segments = await transcribeWithPlatformFallback(fileUrl);
  return segments;
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

    // 直接将 URL 传给 ASR API（火山引擎 ASR 直接支持视频和音频格式）
    const fileName = videoUrl.split('/').pop() || 'unknown.mp4';
    log('TRANSCRIBE_START', '开始转写（直接URL模式，无需FFmpeg）', { fileName, format, frameRate });
    
    const segments = await transcribeWithVolcSpeech(videoUrl, fileName);
    
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
