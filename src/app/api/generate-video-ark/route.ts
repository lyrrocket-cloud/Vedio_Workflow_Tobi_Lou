import { NextRequest, NextResponse } from 'next/server';
import { setTask, VideoTask } from '@/lib/video-task-store';

interface GenerateVideoRequest {
  firstFrameUrl: string;
  lastFrameUrl: string;
  prompt: string;
  duration: number;
  resolution: string;
  ratio: string;
  generateAudio: boolean;
}

// Log helper with timestamp
function log(stage: string, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [ARK-API] [${stage}] ${message}`, data ? JSON.stringify(data) : '');
}

// 火山方舟 API 配置
const ARK_API_KEY = process.env.ARK_API_KEY || '5beaa835-c9f1-4ac4-907c-566a2e0e268b';
const ARK_BASE_URL = 'https://ARK_ENDPOINT.open.bigmodel.cn/api/paas/v4';

// 分辨率映射
const RESOLUTION_MAP: Record<string, { width: number; height: number }> = {
  '480p': { width: 854, height: 480 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
};

// 宽高比映射
const RATIO_MAP: Record<string, { width: number; height: number }> = {
  '16:9': { width: 16, height: 9 },
  '9:16': { width: 9, height: 16 },
  '1:1': { width: 1, height: 1 },
  '4:3': { width: 4, height: 3 },
  '3:4': { width: 3, height: 4 },
};

// 将图片URL下载并转换为base64
async function fetchImageAsBase64(imageUrl: string): Promise<string> {
  try {
    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString('base64');
  } catch (error) {
    log('IMAGE_ERROR', '图片下载失败', { url: imageUrl, error: String(error) });
    throw new Error(`图片下载失败: ${imageUrl}`);
  }
}

// 轮询任务状态
async function pollTaskStatus(taskId: string, maxWaitTime: number = 300): Promise<{ status: string; videoUrl?: string; error?: string }> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime * 1000) {
    try {
      const response = await fetch(`${ARK_BASE_URL}/video/generations/${taskId}`, {
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
      log('POLL_STATUS', '任务状态', { taskId, status: data.task_status, progress: data.task_progress });

      if (data.task_status === 'SUCCESS') {
        return { status: 'succeeded', videoUrl: data.video_url };
      } else if (data.task_status === 'FAIL') {
        return { status: 'failed', error: data.error?.message || '任务失败' };
      } else if (data.task_status === 'CANCEL') {
        return { status: 'cancelled', error: '任务已取消' };
      }

      // 等待后继续轮询
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      log('POLL_ERROR', '轮询异常', { error: String(error) });
      throw error;
    }
  }

  return { status: 'running', error: '任务超时' };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  log('REQUEST', '收到火山方舟视频生成请求');
  
  try {
    const body: GenerateVideoRequest = await request.json();
    const { firstFrameUrl, lastFrameUrl, prompt, duration, resolution, ratio, generateAudio } = body;

    log('REQUEST_BODY', '请求参数', {
      duration,
      resolution,
      ratio,
      generateAudio,
      firstFrameUrlLength: firstFrameUrl?.length,
      lastFrameUrlLength: lastFrameUrl?.length,
    });

    // Validate required fields
    if (!firstFrameUrl || !lastFrameUrl) {
      log('VALIDATION_ERROR', '缺少必需参数');
      return NextResponse.json({ error: '首帧和尾帧图片URL是必需的' }, { status: 400 });
    }

    // 下载图片并转换为 base64
    log('DOWNLOAD', '下载图片', { firstFrameUrl, lastFrameUrl });
    const [firstFrameBase64, lastFrameBase64] = await Promise.all([
      fetchImageAsBase64(firstFrameUrl),
      fetchImageAsBase64(lastFrameUrl),
    ]);
    log('DOWNLOAD', '图片下载完成');

    // 获取分辨率和宽高比
    const resConfig = RESOLUTION_MAP[resolution] || RESOLUTION_MAP['720p'];
    const ratioConfig = RATIO_MAP[ratio] || RATIO_MAP['16:9'];

    // 构建请求体
    const requestBody = {
      model: 'cogvideox',
      prompt: prompt || '视频必须严格从首帧图片开始，平滑过渡到尾帧图片结束。',
      first_frame_image: firstFrameBase64,
      last_frame_image: lastFrameBase64,
      duration: duration || 5,
      resolution: `${resConfig.width}x${resConfig.height}`,
      aspect_ratio: `${ratioConfig.width}:${ratioConfig.height}`,
      with_audio: generateAudio ?? false, // 默认静音
    };

    log('API_CALL', '调用火山方舟视频生成API', {
      model: 'cogvideox',
      duration: requestBody.duration,
      resolution: requestBody.resolution,
      aspect_ratio: requestBody.aspect_ratio,
    });

    // 调用火山方舟 API
    const response = await fetch(`${ARK_BASE_URL}/video/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ARK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log('API_ERROR', 'API调用失败', { status: response.status, error: errorText });
      throw new Error(`API调用失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    log('API_RESPONSE', 'API响应', data);

    const taskId = data.id || data.task_id;
    if (!taskId) {
      throw new Error('未获取到任务ID');
    }

    // 存储任务
    const task: VideoTask = {
      id: taskId,
      status: 'queued',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      params: {
        firstFrameUrl,
        lastFrameUrl,
        prompt,
        duration: duration || 5,
        resolution: resolution || '720p',
        ratio: ratio || '16:9',
        generateAudio: generateAudio ?? false,
      },
    };
    setTask(taskId, task);

    // 轮询任务状态（同步模式等待完成）
    log('POLLING', '开始轮询任务状态', { taskId });
    const result = await pollTaskStatus(taskId, 300);

    // 更新任务状态
    const { updateTask } = await import('@/lib/video-task-store');
    updateTask(taskId, {
      status: result.status as 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled',
      videoUrl: result.videoUrl,
      error: result.error,
      updatedAt: Date.now(),
    });

    const totalTime = Date.now() - startTime;
    log('COMPLETE', '任务完成', { taskId, status: result.status, totalTime: `${totalTime}ms` });

    return NextResponse.json({
      success: result.status === 'succeeded',
      taskId,
      status: result.status,
      videoUrl: result.videoUrl,
      error: result.error,
      message: result.status === 'succeeded' ? '视频生成成功' : `任务状态: ${result.status}`,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    log('ERROR', '任务执行失败', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
