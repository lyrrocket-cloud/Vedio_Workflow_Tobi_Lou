import { NextRequest, NextResponse } from 'next/server';
import { updateTask, getTask } from '@/lib/video-task-store';
import { TaskStatus } from 'coze-coding-dev-sdk';

// Log helper
function log(stage: string, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [CALLBACK] [${stage}] ${message}`, data ? JSON.stringify(data) : '');
}

interface CallbackData {
  id: string;
  status: TaskStatus;
  content?: {
    video_url?: string;
    last_frame_url?: string;
  };
  error_message?: string;
  duration?: number;
  resolution?: string;
  ratio?: string;
}

export async function POST(request: NextRequest) {
  log('RECEIVED', '收到视频生成回调');
  
  try {
    const body: CallbackData = await request.json();
    
    log('BODY', '回调数据', {
      taskId: body.id,
      status: body.status,
      hasVideoUrl: !!body.content?.video_url,
      error: body.error_message,
    });

    const { id: taskId, status, content, error_message } = body;

    if (!taskId) {
      log('ERROR', '缺少taskId');
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    // Check if task exists
    const existingTask = getTask(taskId);
    if (!existingTask) {
      log('WARN', '任务不存在，可能是新的回调', { taskId });
    }

    // Update task status
    const updates: Partial<ReturnType<typeof getTask>> = {
      status,
      updatedAt: Date.now(),
    };

    if (status === 'succeeded' && content?.video_url) {
      updates.videoUrl = content.video_url;
      if (content.last_frame_url) {
        updates.lastFrameUrl = content.last_frame_url;
      }
      log('SUCCESS', '视频生成成功', { taskId, videoUrl: content.video_url });
    } else if (status === 'failed') {
      updates.error = error_message || '视频生成失败';
      log('FAILED', '视频生成失败', { taskId, error: error_message });
    }

    const updatedTask = updateTask(taskId, updates);
    
    if (!updatedTask) {
      // Task doesn't exist in store, create it
      const { setTask } = await import('@/lib/video-task-store');
      setTask(taskId, {
        id: taskId,
        status,
        videoUrl: content?.video_url,
        lastFrameUrl: content?.last_frame_url,
        error: error_message,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        params: {
          firstFrameUrl: '',
          lastFrameUrl: '',
          prompt: '',
          duration: 0,
          resolution: '',
          ratio: '',
          generateAudio: false,
        },
      });
      log('CREATED', '创建新任务记录', { taskId });
    }

    return NextResponse.json({ 
      success: true, 
      taskId,
      status,
      message: '回调处理成功',
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    log('ERROR', '处理回调失败', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// Also support GET for health check
export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    message: 'Video callback endpoint is ready',
  });
}
