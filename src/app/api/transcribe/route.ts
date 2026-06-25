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

const VOLC_ASR_API_KEY = process.env.VOLC_ASR_API_KEY || process.env.VOLC_API_KEY || 'be9ce267-c0d2-44b1-90f6-75964c4ec8fe';
const VOLC_ASR_URL = 'https://openspeech.bytedance.com/api/v2/asr';

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

function generateMockSegments(text: string, duration: number = 30): SubtitleSegment[] {
  const sentences = text.split(/[。！？.!?\n]+/).filter(s => s.trim().length > 0);
  if (sentences.length === 0) {
    return [{ id: 1, start: 0, end: duration, text: text || '这是一段示例字幕文本。' }];
  }
  
  const perSegDuration = duration / sentences.length;
  return sentences.map((sentence, index) => ({
    id: index + 1,
    start: index * perSegDuration,
    end: (index + 1) * perSegDuration,
    text: sentence.trim(),
  }));
}

async function transcribeWithMock(fileUrl: string, fileName: string): Promise<SubtitleSegment[]> {
  log('MOCK_TRANSCRIBE', '使用模拟转写', { fileName });
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const mockTexts = [
    '欢迎使用智能字幕生成系统。本系统支持视频和音频文件的自动转写。',
    '通过先进的语音识别技术，我们可以将语音内容快速转换为文字。',
    '生成的字幕可以导出为SRT格式或Final Cut Pro XML格式，方便后期编辑使用。',
    '您可以根据需要调整帧率设置，以适配不同的视频项目。',
    '感谢您的使用，如有问题请随时联系我们。',
  ];
  
  const fullText = mockTexts.join(' ');
  return generateMockSegments(fullText, 25);
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
    
    log('TRANSCRIBE_START', '开始转写', { fileName, format, frameRate });
    
    const segments = await transcribeWithMock(fileUrl, fileName || 'unknown');
    
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
