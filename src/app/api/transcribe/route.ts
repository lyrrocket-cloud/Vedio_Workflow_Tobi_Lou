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

const ARK_API_KEY = process.env.ARK_API_KEY || '5beaa835-c9f1-4ac4-907c-566a2e0e268b';
const ARK_BASE_URL = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
const ARK_ASR_MODEL = process.env.ARK_ASR_MODEL || 'ep-20260625150723-xmwpq';

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

async function pollASRStatus(taskId: string, maxWaitTime: number = 180): Promise<{ status: string; segments?: SubtitleSegment[]; error?: string }> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime * 1000) {
    try {
      const pollUrl = `${ARK_BASE_URL}/speech/recognition/tasks/${taskId}`;
      log('POLL_REQUEST', '查询ASR任务状态', { url: pollUrl, taskId });
      
      const response = await fetch(pollUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${ARK_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        log('POLL_ERROR', '轮询状态失败', { status: response.status, error: errorText });
        throw new Error(`轮询失败: ${response.status}`);
      }

      const data = await response.json();
      log('POLL_RESPONSE', 'ASR任务响应', { taskId, data: JSON.stringify(data).slice(0, 500) });

      const taskStatus = data.status || data.task_status || data.state || 'unknown';
      log('POLL_STATUS', 'ASR任务状态解析', { taskId, rawStatus: data.status, parsedStatus: taskStatus });

      if (taskStatus === 'succeed' || taskStatus === 'succeeded' || taskStatus === 'success' || taskStatus === 'completed') {
        const segments = parseASRSegments(data);
        log('POLL_SUCCESS', 'ASR任务成功', { taskId, segments: segments.length });
        return { status: 'succeeded', segments };
      } else if (taskStatus === 'failed' || taskStatus === 'fail' || taskStatus === 'error') {
        const errorMsg = data.error?.message || data.message || data.error || 'ASR任务失败';
        log('POLL_FAILED', 'ASR任务失败', { taskId, error: errorMsg });
        return { status: 'failed', error: errorMsg };
      } else if (taskStatus === 'cancelled' || taskStatus === 'cancel') {
        log('POLL_CANCELLED', 'ASR任务取消', { taskId });
        return { status: 'cancelled', error: '任务已取消' };
      }

      log('POLL_RUNNING', 'ASR任务进行中，继续等待', { taskId, status: taskStatus });

      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      log('POLL_ERROR', '轮询异常', { error: String(error) });
      throw error;
    }
  }

  log('POLL_TIMEOUT', 'ASR任务超时', { taskId, maxWaitTime });
  return { status: 'running', error: '任务超时' };
}

function parseASRSegments(data: Record<string, unknown>): SubtitleSegment[] {
  const result: SubtitleSegment[] = [];
  
  try {
    const resultData = data.result as Record<string, unknown> || {};
    const outputData = data.output as Record<string, unknown> || {};
    
    const alternatives = resultData.alternatives || outputData.alternatives || data.alternatives;
    if (Array.isArray(alternatives) && alternatives.length > 0) {
      const firstAlternative = alternatives[0] as Record<string, unknown>;
      const words = firstAlternative.words || firstAlternative.segments || firstAlternative.items;
      
      if (Array.isArray(words)) {
        words.forEach((word: Record<string, unknown>, index: number) => {
          const start = typeof word.start === 'number' ? word.start : 
                       typeof word.begin_time === 'number' ? word.begin_time / 1000 : 
                       typeof word.start_time === 'number' ? word.start_time : 
                       index * 2;
          const end = typeof word.end === 'number' ? word.end : 
                     typeof word.end_time === 'number' ? word.end_time / 1000 : 
                     typeof word.duration === 'number' ? start + (word.duration / 1000) : 
                     start + 2;
          const text = word.text || word.word || '';
          
          if (text && typeof text === 'string') {
            result.push({
              id: index + 1,
              start: parseFloat(start.toFixed(3)),
              end: parseFloat(end.toFixed(3)),
              text: text.trim(),
            });
          }
        });
      } else {
        const text = firstAlternative.text || resultData.text || '';
        if (text) {
          result.push({ id: 1, start: 0, end: 30, text: String(text) });
        }
      }
    } else {
      const text = resultData.text || outputData.text || '';
      if (text) {
        result.push({ id: 1, start: 0, end: 30, text: String(text) });
      }
    }
  } catch (e) {
    log('PARSE_ERROR', '解析ASR结果失败', { error: String(e) });
  }
  
  return result.length > 0 ? result : [{ id: 1, start: 0, end: 30, text: '未识别到语音内容' }];
}

async function transcribeWithVolcARK(fileUrl: string, fileName: string): Promise<SubtitleSegment[]> {
  log('ARK_TRANSCRIBE', '使用火山方舟ASR转写', { fileName, model: ARK_ASR_MODEL });
  
  const requestBody = {
    model: ARK_ASR_MODEL,
    audio_url: fileUrl,
    language: 'zh',
    enable_word_timestamp: true,
  };

  log('ARK_API_CALL', '调用火山方舟ASR API', {
    url: `${ARK_BASE_URL}/speech/recognition/tasks`,
    model: ARK_ASR_MODEL,
    audioUrl: fileUrl.slice(0, 50) + '...',
  });

  const response = await fetch(`${ARK_BASE_URL}/speech/recognition/tasks`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ARK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    log('ARK_API_ERROR', 'ASR API调用失败', { status: response.status, error: errorText });
    throw new Error(`ASR API调用失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  log('ARK_API_RESPONSE', 'ASR API响应', data);

  const taskId = data.id || data.task_id;
  if (!taskId) {
    log('ARK_API_ERROR', '未获取到ASR任务ID', { response: data });
    throw new Error('未获取到ASR任务ID');
  }

  log('ARK_POLLING', '开始轮询ASR任务状态', { taskId });
  const result = await pollASRStatus(taskId, 180);

  if (result.status !== 'succeeded') {
    throw new Error(result.error || 'ASR转写失败');
  }

  return result.segments || [];
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
    
    log('TRANSCRIBE_START', '开始转写', { fileName, format, frameRate, model: ARK_ASR_MODEL });
    
    const segments = await transcribeWithVolcARK(fileUrl, fileName || 'unknown');
    
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
