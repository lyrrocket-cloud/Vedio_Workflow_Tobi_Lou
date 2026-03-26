import { NextRequest, NextResponse } from 'next/server';
import { getTask } from '@/lib/video-task-store';

// Log helper
function log(stage: string, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [STATUS] [${stage}] ${message}`, data ? JSON.stringify(data) : '');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  
  log('QUERY', '查询任务状态', { taskId });

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
  }

  const task = getTask(taskId);
  
  if (!task) {
    log('NOT_FOUND', '任务不存在', { taskId });
    return NextResponse.json({ 
      error: 'Task not found',
      taskId,
    }, { status: 404 });
  }

  log('FOUND', '任务状态', { 
    taskId, 
    status: task.status,
    hasVideoUrl: !!task.videoUrl,
    elapsed: `${Math.round((Date.now() - task.createdAt) / 1000)}秒`,
  });

  return NextResponse.json({
    taskId: task.id,
    status: task.status,
    videoUrl: task.videoUrl,
    lastFrameUrl: task.lastFrameUrl,
    error: task.error,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    elapsed: Math.round((Date.now() - task.createdAt) / 1000),
    params: task.params,
  });
}
