import { NextRequest, NextResponse } from 'next/server';
import { deleteTask } from '@/lib/video-task-store';

// Log helper
function log(stage: string, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [TASKS] [${stage}] ${message}`, data ? JSON.stringify(data) : '');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  log('DELETE', '删除任务', { taskId });

  const deleted = deleteTask(taskId);

  if (deleted) {
    log('RESULT', '任务删除成功', { taskId });
    return NextResponse.json({
      success: true,
      message: '任务删除成功',
    });
  } else {
    log('RESULT', '任务不存在', { taskId });
    return NextResponse.json(
      {
        success: false,
        message: '任务不存在',
      },
      { status: 404 }
    );
  }
}
