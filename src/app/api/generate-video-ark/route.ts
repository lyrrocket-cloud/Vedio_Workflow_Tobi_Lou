import { NextRequest, NextResponse } from 'next/server';
import { setTask, updateTask, VideoTask } from '@/lib/video-task-store';

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
const ARK_API_KEY = process.env.ARK_API_KEY || '';
const ARK_BASE_URL = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
const ARK_MODEL = process.env.ARK_MODEL || 'ep-20260413164845-qq85t';

// 轮询任务状态
async function pollTaskStatus(taskId: string, maxWaitTime: number = 300): Promise<{ status: string; videoUrl?: string; error?: string }> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime * 1000) {
    try {
      const pollUrl = `${ARK_BASE_URL}/contents/generations/tasks/${taskId}`;
      log('POLL_REQUEST', '查询任务状态', { url: pollUrl, taskId });
      
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
      log('POLL_RESPONSE', '任务响应', { taskId, data });

      // 检查各种可能的状态字段
      const taskStatus = data.status || data.task_status || data.state || 'unknown';
      log('POLL_STATUS', '任务状态解析', { taskId, rawStatus: data.status, parsedStatus: taskStatus, fullData: JSON.stringify(data).slice(0, 500) });

      // 调试：检查状态是否匹配
      log('POLL_DEBUG', '状态匹配检查', { 
        taskStatus, 
        isSucceed: taskStatus === 'succeed',
        isSuccess: taskStatus === 'success', 
        isCompleted: taskStatus === 'completed',
        isFailed: taskStatus === 'failed'
      });

      if (taskStatus === 'succeed' || taskStatus === 'succeeded' || taskStatus === 'success' || taskStatus === 'completed') {
        // 获取视频URL - 尝试多种可能的字段
        // 注意：火山方舟API返回的video_url在data.content.video_url中
        const videoUrl = 
          data.content?.video_url || 
          data.output?.video_url || 
          data.output?.video || 
          data.video_url || 
          data.url || 
          data.output?.choices?.[0]?.video_url;
        
        log('POLL_SUCCESS', '任务成功', { taskId, videoUrl, hasVideoUrl: !!videoUrl });
        
        // 更新任务状态为成功
        updateTask(taskId, {
          status: 'succeeded',
          videoUrl: videoUrl,
          updatedAt: Date.now(),
        });
        
        return { status: 'succeeded', videoUrl };
      } else if (taskStatus === 'failed' || taskStatus === 'fail' || taskStatus === 'error') {
        const errorMsg = data.error?.message || data.message || data.error || '任务失败';
        log('POLL_FAILED', '任务失败', { taskId, error: errorMsg });
        return { status: 'failed', error: errorMsg };
      } else if (taskStatus === 'cancelled' || taskStatus === 'cancel') {
        log('POLL_CANCELLED', '任务取消', { taskId });
        return { status: 'cancelled', error: '任务已取消' };
      }

      // pending, running, in_progress 等状态都继续轮询
      log('POLL_RUNNING', '任务进行中，继续等待', { taskId, status: taskStatus });

      // 更新任务状态
      updateTask(taskId, {
        status: 'running',
        updatedAt: Date.now(),
      });

      // 等待后继续轮询
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      log('POLL_ERROR', '轮询异常', { error: String(error) });
      throw error;
    }
  }

  log('POLL_TIMEOUT', '任务超时', { taskId, maxWaitTime });
  return { status: 'running', error: '任务超时' };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  log('REQUEST', '收到火山方舟视频生成请求');
  
  // 检查 API 配置
  if (!ARK_API_KEY) {
    const error = '火山方舟 API 未配置。请设置 ARK_API_KEY 环境变量。';
    log('CONFIG_ERROR', error);
    return NextResponse.json({ success: false, error }, { status: 500 });
  }

  try {
    const body: GenerateVideoRequest = await request.json();
    const { firstFrameUrl, lastFrameUrl, prompt, duration, resolution, ratio, generateAudio } = body;

    log('REQUEST_BODY', '请求参数', {
      duration,
      resolution,
      ratio,
      generateAudio,
      model: ARK_MODEL,
      firstFrameUrl,
      lastFrameUrl,
    });

    // Validate required fields
    if (!firstFrameUrl || !lastFrameUrl) {
      log('VALIDATION_ERROR', '缺少必需参数');
      return NextResponse.json({ error: '首帧和尾帧图片URL是必需的' }, { status: 400 });
    }

    // 构建请求体 - 使用火山方舟API格式
    const requestBody = {
      model: ARK_MODEL,
      content: [
        {
          type: "text",
          text: `${prompt || '视频必须严格从首帧图片开始，平滑过渡到尾帧图片结束'} --duration ${duration || 5} --camerafixed false --watermark true`,
        },
        {
          type: "image_url",
          role: "first_frame",
          image_url: {
            url: firstFrameUrl,
          },
        },
        {
          type: "image_url",
          role: "last_frame",
          image_url: {
            url: lastFrameUrl,
          },
        },
      ],
    };

    log('API_CALL', '调用火山方舟视频生成API', {
      url: `${ARK_BASE_URL}/contents/generations/tasks`,
      model: ARK_MODEL,
      duration: duration || 5,
    });

    // 调用火山方舟 API
    const response = await fetch(`${ARK_BASE_URL}/contents/generations/tasks`, {
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
      log('API_ERROR', '未获取到任务ID', { response: data });
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
