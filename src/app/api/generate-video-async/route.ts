import { NextRequest, NextResponse } from 'next/server';
import { VideoGenerationClient, Config, HeaderUtils, Content } from 'coze-coding-dev-sdk';
import { setTask, VideoTask } from '@/lib/video-task-store';

interface GenerateVideoRequest {
  firstFrameUrl: string;
  lastFrameUrl: string;
  prompt: string;
  duration: number;
  resolution: string;
  ratio: string;
  generateAudio: boolean;
  mockMode?: boolean;
}

// Log helper with timestamp
function log(stage: string, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [ASYNC-SUBMIT] [${stage}] ${message}`, data ? JSON.stringify(data) : '');
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  log('REQUEST', '收到异步视频生成请求');
  
  const body: GenerateVideoRequest = await request.json();
  const { firstFrameUrl, lastFrameUrl, prompt, duration, resolution, ratio, generateAudio, mockMode } = body;

  log('REQUEST_BODY', '请求参数', {
    duration,
    resolution,
    ratio,
    generateAudio,
    mockMode,
    firstFrameUrlLength: firstFrameUrl?.length,
    lastFrameUrlLength: lastFrameUrl?.length,
  });

  // Validate required fields
  if (!firstFrameUrl || !lastFrameUrl) {
    log('VALIDATION_ERROR', '缺少必需参数');
    return NextResponse.json({ error: '首帧和尾帧图片URL是必需的' }, { status: 400 });
  }

  // Mock mode
  if (mockMode) {
    const mockTaskId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    // Store mock task
    const mockTask: VideoTask = {
      id: mockTaskId,
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
        generateAudio: generateAudio ?? true,
      },
    };
    setTask(mockTaskId, mockTask);
    
    log('MOCK_TASK', '模拟模式创建任务', { taskId: mockTaskId });
    
    // Simulate processing in background
    setTimeout(async () => {
      const { updateTask } = await import('@/lib/video-task-store');
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      updateTask(mockTaskId, {
        status: 'running',
      });
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      updateTask(mockTaskId, {
        status: 'succeeded',
        videoUrl: 'https://coze-coding-mockdata.tos-cn-beijing.volces.com/video_g1hsdk.mp4',
      });
      
      log('MOCK_COMPLETE', '模拟任务完成', { taskId: mockTaskId });
    }, 100);
    
    return NextResponse.json({
      success: true,
      taskId: mockTaskId,
      message: '任务已提交（模拟模式）',
    });
  }

  try {
    // Extract headers for forwarding
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    
    // Prepare content
    const content: Content[] = [
      {
        type: 'image_url',
        image_url: { url: firstFrameUrl },
        role: 'first_frame',
      },
      {
        type: 'image_url',
        image_url: { url: lastFrameUrl },
        role: 'last_frame',
      },
      {
        type: 'text',
        text: prompt || '视频必须严格从首帧图片开始，平滑过渡到尾帧图片结束。',
      },
    ];

    // Get domain for callback URL
    const domain = process.env.COZE_PROJECT_DOMAIN_DEFAULT || 'http://localhost:5000';
    const callbackUrl = `${domain}/api/video-callback`;
    
    log('CALLBACK_URL', '设置回调URL', { callbackUrl });

    // Initialize client
    const config = new Config();
    const client = new VideoGenerationClient(config, customHeaders as Record<string, string>);

    log('API_CALL', '调用videoGenerationAsync', {
      model: 'doubao-seedance-1-5-pro-251215',
      callbackUrl,
    });

    // Use async method - this should return immediately with taskId
    const response = await client.videoGenerationAsync(content, {
      model: 'doubao-seedance-1-5-pro-251215',
      duration: duration || 5,
      resolution: resolution as '480p' | '720p' | '1080p' || '720p',
      ratio: ratio as '16:9' | '9:16' | '1:1' | '4:3' | '3:4' || '16:9',
      generateAudio: generateAudio ?? true,
      callbackUrl,
      maxWaitTime: 900, // 后端轮询超时（但应该立即返回）
    });

    const taskId = response.response.id;
    log('API_RESPONSE', '异步API响应', {
      taskId,
      status: response.response.status,
      hasVideoUrl: !!response.videoUrl,
    });

    // Store task info
    const task: VideoTask = {
      id: taskId,
      status: response.response.status,
      videoUrl: response.videoUrl || undefined,
      lastFrameUrl: response.lastFrameUrl || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      params: {
        firstFrameUrl,
        lastFrameUrl,
        prompt,
        duration: duration || 5,
        resolution: resolution || '720p',
        ratio: ratio || '16:9',
        generateAudio: generateAudio ?? true,
      },
    };
    setTask(taskId, task);

    const totalTime = Date.now() - startTime;
    log('COMPLETE', '任务提交完成', { taskId, totalTime: `${totalTime}ms` });

    return NextResponse.json({
      success: true,
      taskId,
      status: response.response.status,
      message: '任务已提交，请轮询状态或等待回调',
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    log('ERROR', '提交任务失败', {
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
