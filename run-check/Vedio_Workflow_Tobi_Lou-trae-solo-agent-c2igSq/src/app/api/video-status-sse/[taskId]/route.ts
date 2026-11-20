import { NextRequest } from 'next/server';
import { getTask } from '@/lib/video-task-store';

// SSE helper
function sendEvent(controller: ReadableStreamDefaultController, event: string, data: Record<string, unknown>) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(message));
}

// Log helper
function log(taskId: string, stage: string, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [SSE-${taskId.slice(0, 8)}] [${stage}] ${message}`, data ? JSON.stringify(data) : '');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  
  log(taskId, 'CONNECT', 'SSE连接建立');

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      let lastStatus = '';
      let checkCount = 0;

      // Send initial status
      const task = getTask(taskId);
      if (!task) {
        sendEvent(controller, 'error', {
          message: '任务不存在',
          taskId,
        });
        controller.close();
        return;
      }

      sendEvent(controller, 'status', {
        taskId: task.id,
        status: task.status,
        videoUrl: task.videoUrl,
        error: task.error,
        elapsed: 0,
        message: '开始监听任务状态',
      });

      lastStatus = task.status;

      // Poll for status updates
      const pollInterval = setInterval(() => {
        checkCount++;
        const currentTask = getTask(taskId);
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        if (!currentTask) {
          log(taskId, 'NOT_FOUND', '任务已删除');
          sendEvent(controller, 'error', {
            message: '任务已删除',
            taskId,
          });
          clearInterval(pollInterval);
          controller.close();
          return;
        }

        // Log every 10 checks
        if (checkCount % 10 === 0) {
          log(taskId, 'POLL', `状态检查 #${checkCount}`, {
            status: currentTask.status,
            elapsed,
          });
        }

        // Status changed
        if (currentTask.status !== lastStatus) {
          log(taskId, 'STATUS_CHANGE', '状态变化', {
            from: lastStatus,
            to: currentTask.status,
          });
          
          sendEvent(controller, 'status', {
            taskId: currentTask.id,
            status: currentTask.status,
            videoUrl: currentTask.videoUrl,
            lastFrameUrl: currentTask.lastFrameUrl,
            error: currentTask.error,
            elapsed,
            message: getStatusMessage(currentTask.status),
          });
          
          lastStatus = currentTask.status;
        }

        // Send heartbeat every 5 seconds
        if (checkCount % 5 === 0) {
          sendEvent(controller, 'heartbeat', {
            elapsed,
            status: currentTask.status,
            timestamp: new Date().toISOString(),
          });
        }

        // Task completed or failed
        if (currentTask.status === 'succeeded') {
          log(taskId, 'COMPLETE', '任务成功', {
            videoUrl: currentTask.videoUrl,
            totalElapsed: elapsed,
          });
          
          sendEvent(controller, 'complete', {
            taskId: currentTask.id,
            videoUrl: currentTask.videoUrl,
            lastFrameUrl: currentTask.lastFrameUrl,
            elapsed,
            message: '视频生成成功！',
          });
          
          clearInterval(pollInterval);
          controller.close();
          return;
        }

        if (currentTask.status === 'failed') {
          log(taskId, 'FAILED', '任务失败', {
            error: currentTask.error,
            totalElapsed: elapsed,
          });
          
          sendEvent(controller, 'error', {
            taskId: currentTask.id,
            error: currentTask.error,
            elapsed,
            message: '视频生成失败',
          });
          
          clearInterval(pollInterval);
          controller.close();
          return;
        }

        // Timeout after 15 minutes
        if (elapsed > 900) {
          log(taskId, 'TIMEOUT', '超时', { elapsed });
          
          sendEvent(controller, 'error', {
            taskId,
            error: '等待超时，请重试',
            elapsed,
          });
          
          clearInterval(pollInterval);
          controller.close();
        }
      }, 1000);

      // Cleanup on disconnect
      const cleanup = () => {
        clearInterval(pollInterval);
        log(taskId, 'DISCONNECT', 'SSE连接断开');
      };

      // Handle abort signal
      request.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

function getStatusMessage(status: string): string {
  switch (status) {
    case 'queued':
      return '任务排队中...';
    case 'running':
      return '正在生成视频...';
    case 'succeeded':
      return '视频生成成功！';
    case 'failed':
      return '视频生成失败';
    case 'cancelled':
      return '任务已取消';
    default:
      return `状态: ${status}`;
  }
}
