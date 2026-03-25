import { NextRequest } from 'next/server';
import { VideoGenerationClient, Config, HeaderUtils, Content } from 'coze-coding-dev-sdk';

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

// SSE helper to send events
function sendEvent(controller: ReadableStreamDefaultController, event: string, data: Record<string, unknown>) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(message));
}

// Log helper with timestamp
function log(stage: string, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const elapsed = globalThis.__generationStartTime ? Date.now() - globalThis.__generationStartTime : 0;
  console.log(`[${timestamp}] [+${elapsed}ms] [${stage}] ${message}`, data ? JSON.stringify(data) : '');
}

// Global start time for elapsed calculation
declare global {
  var __generationStartTime: number | undefined;
}

// Mock video generation for testing
async function mockVideoGeneration(
  controller: ReadableStreamDefaultController,
  startTime: number,
  duration: number,
  resolution: string,
  ratio: string
) {
  const steps = [
    { progress: 15, message: '初始化视频生成客户端...' },
    { progress: 20, message: '准备首尾帧图片数据...' },
    { progress: 30, message: 'AI模型正在分析首尾帧图片...' },
    { progress: 40, message: '正在生成转场动画...' },
    { progress: 50, message: '计算帧间过渡效果...' },
    { progress: 60, message: '渲染中间帧画面...' },
    { progress: 70, message: '优化视频流畅度...' },
    { progress: 80, message: '处理画面细节...' },
    { progress: 90, message: '视频生成完成，准备播放...' },
  ];

  for (const step of steps) {
    await new Promise(resolve => setTimeout(resolve, 800));
    sendEvent(controller, 'status', {
      step: 'processing',
      message: step.message,
      timestamp: new Date().toISOString(),
      progress: step.progress,
      elapsed: Math.floor((Date.now() - startTime) / 1000),
    });
  }

  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  
  // Return mock video URL
  sendEvent(controller, 'complete', {
    step: 'complete',
    message: '转场视频生成成功！(模拟模式)',
    timestamp: new Date().toISOString(),
    progress: 100,
    videoUrl: 'https://coze-coding-mockdata.tos-cn-beijing.volces.com/video_g1hsdk.mp4',
    taskId: `mock_${Date.now()}`,
    status: 'succeeded',
    totalTime,
    duration,
    resolution,
    ratio,
  });

  controller.close();
}

export async function POST(request: NextRequest) {
  // Initialize global start time
  globalThis.__generationStartTime = Date.now();
  
  log('REQUEST', '收到视频生成请求');
  
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
    promptLength: prompt?.length,
  });

  // Validate required fields
  if (!firstFrameUrl || !lastFrameUrl) {
    log('VALIDATION_ERROR', '缺少必需参数');
    return new Response(JSON.stringify({ error: '首帧和尾帧图片URL是必需的' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      
      log('STREAM_START', '开始SSE流');
      
      // Step 1: Initialize
      sendEvent(controller, 'status', {
        step: 'init',
        message: mockMode ? '🧪 模拟模式：初始化视频生成...' : '初始化视频生成客户端...',
        timestamp: new Date().toISOString(),
        progress: 5,
      });

      // If mock mode, use mock generation
      if (mockMode) {
        log('MOCK_MODE', '使用模拟模式');
        await mockVideoGeneration(controller, startTime, duration || 5, resolution || '720p', ratio || '16:9');
        return;
      }

      try {
        // Extract headers for forwarding
        log('HEADERS', '提取转发headers');
        const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
        log('HEADERS_EXTRACTED', 'Headers提取完成', { headerCount: Object.keys(customHeaders).length });

        // Step 2: Prepare content
        sendEvent(controller, 'status', {
          step: 'prepare',
          message: '准备首尾帧图片数据...',
          timestamp: new Date().toISOString(),
          progress: 10,
        });

        // Prepare content with first and last frame images
        log('CONTENT_PREPARE', '准备内容对象');
        const content: Content[] = [
          {
            type: 'image_url',
            image_url: {
              url: firstFrameUrl,
            },
            role: 'first_frame',
          },
          {
            type: 'image_url',
            image_url: {
              url: lastFrameUrl,
            },
            role: 'last_frame',
          },
          {
            type: 'text',
            text: prompt || '视频必须严格从首帧图片开始，平滑过渡到尾帧图片结束。确保视频的第一帧与首帧图片完全相同，最后一帧与尾帧图片完全相同，中间过程自然流畅地过渡变化。',
          },
        ];
        log('CONTENT_READY', '内容对象准备完成');

        // Step 3: Submit task
        sendEvent(controller, 'status', {
          step: 'submit',
          message: '提交视频生成任务到AI模型...',
          timestamp: new Date().toISOString(),
          progress: 15,
        });

        // Initialize video generation client
        log('CLIENT_INIT', '初始化视频生成客户端');
        const config = new Config();
        const client = new VideoGenerationClient(config, customHeaders as Record<string, string>);
        log('CLIENT_READY', '客户端初始化完成');

        // Step 4: Processing - show real waiting status
        sendEvent(controller, 'status', {
          step: 'processing',
          message: '🎬 已提交任务到AI视频生成服务，等待处理...',
          timestamp: new Date().toISOString(),
          progress: 20,
        });

        // Start video generation with real-time status updates
        // Note: SDK's videoGeneration() is a blocking call that polls internally
        // We send heartbeat events to show the connection is alive
        let apiCallPhase = '提交任务';
        let lastPhaseTime = Date.now();
        
        const progressInterval = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const elapsedSinceLastPhase = Date.now() - lastPhaseTime;
          
          // Update phase message based on elapsed time to give user better feedback
          if (elapsed < 30) {
            apiCallPhase = '初始化AI模型';
          } else if (elapsed < 60) {
            apiCallPhase = '分析首尾帧图片';
          } else if (elapsed < 120) {
            apiCallPhase = '生成中间帧序列';
          } else if (elapsed < 180) {
            apiCallPhase = '渲染视频画面';
          } else if (elapsed < 240) {
            apiCallPhase = '优化视频质量';
          } else {
            apiCallPhase = '最终处理中';
          }
          
          // Log every 30 seconds for debugging
          if (elapsedSinceLastPhase > 30000) {
            log('API_WAITING', `等待API响应 - ${apiCallPhase}`, {
              elapsedSeconds: elapsed,
              phase: apiCallPhase,
            });
            lastPhaseTime = Date.now();
          }
          
          // Progress caps at 85% since we don't know real progress
          // The progress shown is just to indicate activity, not real completion percentage
          const displayProgress = Math.min(85, 20 + Math.floor(elapsed / 10));
          
          sendEvent(controller, 'status', {
            step: 'processing',
            message: `⏳ ${apiCallPhase}... (已等待 ${elapsed} 秒)`,
            timestamp: new Date().toISOString(),
            progress: displayProgress,
            elapsed,
            note: '⚠️ 进度显示为估算值，实际进度未知。视频生成通常需要2-5分钟，请耐心等待。',
          });
        }, 3000);

        // Generate video
        log('API_CALL_START', '开始调用视频生成API', {
          model: 'doubao-seedance-1-5-pro-251215',
          duration,
          resolution,
          ratio,
          generateAudio,
          maxWaitTime: 900,
          说明: 'SDK内部会轮询任务状态，这是阻塞调用，无法获取实时进度',
        });
        
        const apiCallStartTime = Date.now();
        let response;
        try {
          response = await client.videoGeneration(content, {
            model: 'doubao-seedance-1-5-pro-251215',
            duration: duration || 5,
            resolution: resolution as '480p' | '720p' | '1080p' || '720p',
            ratio: ratio as '16:9' | '9:16' | '1:1' | '4:3' | '3:4' || '16:9',
            generateAudio: generateAudio ?? true,
            maxWaitTime: 900,
          });
          log('API_CALL_SUCCESS', 'API调用成功', {
            apiCallDuration: `${Math.round((Date.now() - apiCallStartTime) / 1000)}秒`,
            hasVideoUrl: !!response.videoUrl,
            taskId: response.response?.id,
            status: response.response?.status,
          });
        } finally {
          clearInterval(progressInterval);
          log('PROGRESS_INTERVAL_CLEARED', '清理进度轮询');
        }

        // Step 5: Check result
        const totalTime = Math.floor((Date.now() - startTime) / 1000);
        log('RESULT_CHECK', '检查结果', { totalTime });
        
        if (!response.videoUrl) {
          log('RESULT_ERROR', '视频URL为空', {
            taskId: response.response?.id,
            status: response.response?.status,
            errorMessage: response.response?.error_message,
          });
          sendEvent(controller, 'error', {
            step: 'error',
            message: response.response?.error_message || '视频生成失败 - 未返回视频URL',
            timestamp: new Date().toISOString(),
            taskId: response.response?.id,
            status: response.response?.status,
          });
          controller.close();
          return;
        }

        // Step 6: Success
        log('FINALIZING', '视频生成成功，准备返回');
        sendEvent(controller, 'status', {
          step: 'finalizing',
          message: '视频生成完成，准备播放...',
          timestamp: new Date().toISOString(),
          progress: 95,
        });

        sendEvent(controller, 'complete', {
          step: 'complete',
          message: '转场视频生成成功！',
          timestamp: new Date().toISOString(),
          progress: 100,
          videoUrl: response.videoUrl,
          taskId: response.response.id,
          status: response.response.status,
          totalTime,
          duration: response.response.duration,
          resolution: response.response.resolution,
          ratio: response.response.ratio,
        });

        log('STREAM_COMPLETE', 'SSE流完成', { totalTime });
        controller.close();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '视频生成过程中发生错误';
        log('ERROR', '发生错误', {
          errorMessage,
          errorStack: error instanceof Error ? error.stack : undefined,
        });
        
        // Parse error details for better user feedback
        let userMessage = errorMessage;
        if (errorMessage.includes('403')) {
          userMessage = '⚠️ 视频生成服务权限不足。请尝试开启"模拟模式"进行测试，或联系管理员获取API权限。';
        } else if (errorMessage.includes('401')) {
          userMessage = '⚠️ API认证失败，请联系管理员';
        } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
          userMessage = '⚠️ 请求超时，请稍后重试';
        } else if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
          userMessage = '⚠️ 网络连接失败，请检查网络后重试';
        }
        
        sendEvent(controller, 'error', {
          step: 'error',
          message: userMessage,
          timestamp: new Date().toISOString(),
          progress: 0,
          error: errorMessage,
        });
        controller.close();
      }
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
