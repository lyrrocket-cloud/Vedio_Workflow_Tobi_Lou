import { NextRequest, NextResponse } from 'next/server';
import { getTask, updateTask } from '@/lib/video-task-store';

// Log helper
function log(stage: string, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [CANCEL] [${stage}] ${message}`, data ? JSON.stringify(data) : '');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  
  log('REQUEST', '取消任务', { taskId });
  
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

  // 检查任务状态
  if (task.status === 'succeeded') {
    log('ALREADY_SUCCEEDED', '任务已完成', { taskId });
    return NextResponse.json({ 
      error: '任务已完成，无法取消',
      taskId,
      status: task.status,
    }, { status: 400 });
  }

  if (task.status === 'failed') {
    log('ALREADY_FAILED', '任务已失败', { taskId });
    return NextResponse.json({ 
      error: '任务已失败，无需取消',
      taskId,
      status: task.status,
    }, { status: 400 });
  }

  if (task.status === 'cancelled') {
    log('ALREADY_CANCELLED', '任务已取消', { taskId });
    return NextResponse.json({ 
      error: '任务已取消',
      taskId,
      status: task.status,
    }, { status: 400 });
  }

  // 更新任务状态为已取消
  const updatedTask = updateTask(taskId, {
    status: 'cancelled',
    error: '用户手动取消',
  });
  
  log('CANCELLED', '任务已取消', { taskId });
  
  // 注意：这里只是更新了本地存储的状态
  // 实际的AI服务端任务可能仍在运行
  // 如果SDK支持取消API，可以在这里调用
  
  return NextResponse.json({
    success: true,
    taskId,
    status: 'cancelled',
    message: '任务已取消',
    task: updatedTask,
  });
}
