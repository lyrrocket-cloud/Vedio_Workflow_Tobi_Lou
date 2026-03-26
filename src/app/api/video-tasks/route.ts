import { NextRequest, NextResponse } from 'next/server';
import { getAllTasks } from '@/lib/video-task-store';

// Log helper
function log(stage: string, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [TASKS] [${stage}] ${message}`, data ? JSON.stringify(data) : '');
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status'); // 可选过滤状态
  
  log('QUERY', '获取任务列表', { status });
  
  const tasks = getAllTasks();
  
  // 按状态过滤
  let filteredTasks = tasks;
  if (status) {
    filteredTasks = tasks.filter(t => t.status === status);
  }
  
  // 按创建时间倒序排序
  filteredTasks.sort((a, b) => b.createdAt - a.createdAt);
  
  // 只返回最近50个任务
  const recentTasks = filteredTasks.slice(0, 50);
  
  // 统计各状态数量
  const stats = {
    total: tasks.length,
    queued: tasks.filter(t => t.status === 'queued').length,
    running: tasks.filter(t => t.status === 'running').length,
    succeeded: tasks.filter(t => t.status === 'succeeded').length,
    failed: tasks.filter(t => t.status === 'failed').length,
  };
  
  log('RESULT', '任务列表', { 
    total: recentTasks.length, 
    stats,
  });
  
  // 返回简化后的任务信息
  const simplifiedTasks = recentTasks.map(task => ({
    id: task.id,
    status: task.status,
    videoUrl: task.videoUrl,
    error: task.error,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    elapsed: Math.round((Date.now() - task.createdAt) / 1000),
    params: {
      duration: task.params.duration,
      resolution: task.params.resolution,
      ratio: task.params.ratio,
    },
  }));
  
  return NextResponse.json({
    success: true,
    tasks: simplifiedTasks,
    stats,
  });
}
