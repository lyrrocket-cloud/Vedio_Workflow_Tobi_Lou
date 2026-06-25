import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';

interface SubtitleSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

interface TranscribeRequest {
  fileUrl?: string;
  fileName?: string;
}

const VOLC_APP_ID = process.env.VOLC_APP_ID || '3952155908';
const VOLC_ACCESS_TOKEN = process.env.VOLC_ACCESS_TOKEN || 'gk141HY0oB44sIrT7HwycFUTL7JkgAkr';
const VOLC_SECRET_KEY = process.env.VOLC_SECRET_KEY || 'MS1sWfWny32ozuAvK5HemPrxIm_UWh-M';
const VOLC_RESOURCE_ID = process.env.VOLC_RESOURCE_ID || 'volc.seedasr.auc';
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
  const frames = Math.round(seconds * frameRate);
  return `${frames}/${frameRate}s`;
}

export function generateSRT(segments: SubtitleSegment[]): string {
  return segments.map(seg => `${seg.id}\n${formatTimeSRT(seg.start)} --> ${formatTimeSRT(seg.end)}\n${seg.text}\n`).join('\n');
}

export function generateFCPXML(segments: SubtitleSegment[], frameRate: number = 30): string {
  const totalDuration = segments.length > 0 
    ? formatTimeFCPXML(segments[segments.length - 1].end + 1, frameRate)
    : '0/30s';

  const titleItems = segments.map(seg => {
    const start = formatTimeFCPXML(seg.start, frameRate);
    const duration = formatTimeFCPXML(seg.end - seg.start, frameRate);
    return `
            <title name="字幕 ${seg.id}" lane="1" offset="${start}" ref="r2" start="${start}" duration="${duration}">
                <text>
                    <text-style ref="ts1">${seg.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text-style>
                </text>
            </title>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
    <resources>
        <format id="r1" name="FFVideoFormat1080p${frameRate}" frameDuration="1/${frameRate}s" width="1920" height="1080" colorSpace="1-1-1 (Rec. 709)"/>
        <effect id="r2" name="字幕" uid=".../Titles.localized/Bumper/Basic Title.localized/Basic Title.moti" />
        <text-style-def id="ts1">
            <text-style font="PingFang SC" fontSize="36" fontFace="Semibold" fontColor="1 1 1 1" alignment="center" lineSpacing="0"/>
        </text-style-def>
    </resources>
    <library>
        <event name="字幕项目">
            <project name="字幕序列">
                <sequence format="r1" duration="${totalDuration}">
                    <spine>
                        <gap name="占位符" offset="0s" start="0s" duration="${totalDuration}"/>
                        ${titleItems}
                    </spine>
                </sequence>
            </project>
        </event>
    </library>
</fcpxml>`;
}

function getAudioFormat(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const formatMap: Record<string, string> = {
    'mp3': 'mp3',
    'wav': 'wav',
    'm4a': 'mp4',
    'mp4': 'mp4',
    'mov': 'mp4',
    'ogg': 'ogg',
    'opus': 'opus',
    'raw': 'raw',
  };
  return formatMap[ext] || 'mp3';
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
  
  return result.length > 0 ? result : [{ id: 1, start: 0, end: 30, text: '未识别到语音内容' }];
}

async function submitASRTask(fileUrl: string, fileName: string, requestId: string): Promise<void> {
  const submitUrl = `${VOLC_BASE_URL}/submit`;
  const format = getAudioFormat(fileName);
  
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
    appId: VOLC_APP_ID,
    resourceId: VOLC_RESOURCE_ID,
    format,
    audioUrl: fileUrl.slice(0, 50) + '...',
  });

  const response = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-App-Key': VOLC_APP_ID,
      'X-Api-Access-Key': VOLC_ACCESS_TOKEN,
      'X-Api-Resource-Id': VOLC_RESOURCE_ID,
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

async function queryASRResult(requestId: string): Promise<{ status: string; segments?: SubtitleSegment[]; error?: string }> {
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
      'X-Api-Resource-Id': VOLC_RESOURCE_ID,
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
    return { status: 'failed', error: message || `错误码: ${statusCode}` };
  }
}

async function transcribeWithVolcSpeech(fileUrl: string, fileName: string): Promise<SubtitleSegment[]> {
  log('VOLC_TRANSCRIBE', '使用火山引擎录音文件识别', { fileName, resourceId: VOLC_RESOURCE_ID });
  
  const requestId = generateUUID();
  
  await submitASRTask(fileUrl, fileName, requestId);
  
  log('POLLING_START', '开始轮询ASR结果', { requestId });
  
  const maxWaitTime = 300;
  const pollInterval = 3000;
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime * 1000) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    
    const result = await queryASRResult(requestId);
    
    if (result.status === 'succeeded') {
      return result.segments || [];
    } else if (result.status === 'failed') {
      throw new Error(result.error || 'ASR转写失败');
    }
  }
  
  throw new Error('ASR转写超时，请稍后重试');
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  log('REQUEST', '收到字幕生成请求');
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const format = formData.get('format') as string || 'srt';
    const frameRate = parseInt(formData.get('frameRate') as string || '30', 10);
    
    let fileUrl: string | undefined;
    let fileName: string | undefined;
    
    if (file) {
      log('FILE_INFO', '文件信息', { name: file.name, size: `${(file.size / 1024).toFixed(2)}KB`, type: file.type });
      
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      const storage = new S3Storage({
        endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
        accessKey: '',
        secretKey: '',
        bucketName: process.env.COZE_BUCKET_NAME,
        region: 'cn-beijing',
      });
      
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).slice(2, 8);
      const ext = file.name.split('.').pop() || 'mp3';
      const keyName = `subtitles/${timestamp}_${randomSuffix}.${ext}`;
      
      const key = await storage.uploadFile({
        fileContent: buffer,
        fileName: keyName,
        contentType: file.type,
      });
      
      fileUrl = await storage.generatePresignedUrl({ key, expireTime: 7200 });
      fileName = file.name;
      
      log('UPLOAD_DONE', '文件上传完成', { key });
    } else {
      const body = await request.json().catch(() => ({}));
      fileUrl = (body as TranscribeRequest).fileUrl;
      fileName = (body as TranscribeRequest).fileName;
    }
    
    if (!fileUrl) {
      return NextResponse.json(
        { success: false, error: '请上传文件或提供文件URL' },
        { status: 400 }
      );
    }
    
    log('TRANSCRIBE_START', '开始转写', { fileName, format, frameRate, model: VOLC_RESOURCE_ID });
    
    const segments = await transcribeWithVolcSpeech(fileUrl, fileName || 'unknown');
    
    let content: string;
    let contentType: string;
    let downloadName: string;
    
    if (format === 'fcpxml') {
      content = generateFCPXML(segments, frameRate);
      contentType = 'application/xml';
      downloadName = `subtitle_${Date.now()}.fcpxml`;
    } else {
      content = generateSRT(segments);
      contentType = 'text/plain; charset=utf-8';
      downloadName = `subtitle_${Date.now()}.srt`;
    }
    
    const totalTime = Date.now() - startTime;
    log('COMPLETE', '转写完成', { totalTime: `${totalTime}ms`, segments: segments.length, format });
    
    return NextResponse.json({
      success: true,
      segments,
      format,
      content,
      contentType,
      downloadName,
      frameRate: format === 'fcpxml' ? frameRate : undefined,
      duration: segments.length > 0 ? segments[segments.length - 1].end : 0,
    });
    
  } catch (error) {
    const totalTime = Date.now() - startTime;
    log('ERROR', '转写失败', { totalTime: `${totalTime}ms`, error: error instanceof Error ? error.message : 'Unknown error' });
    
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '转写失败，请重试' },
      { status: 500 }
    );
  }
}
