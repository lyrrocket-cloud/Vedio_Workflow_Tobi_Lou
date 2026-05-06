import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

const GITEE_API_URL = 'https://ai.gitee.com/v1/async/audio/speech';
const GITEE_API_TOKEN = process.env.GITEE_API_TOKEN || 'TZ2MDIJ9DO3MASXXKHIUUFUZMRGFB9JS7AZMBB4I';

interface SfxRequest {
  prompt: string;
  steps?: number;
  guidanceScale?: number;
  outputFormat?: string;
}

// 使用豆包模型将中文翻译为英文
async function translateToEnglish(chineseText: string, requestHeaders: Headers): Promise<string> {
  const config = new Config();
  const customHeaders = HeaderUtils.extractForwardHeaders(requestHeaders);
  const client = new LLMClient(config, customHeaders);

  const messages = [
    {
      role: 'system' as const,
      content: 'You are a professional translator. Translate the following Chinese text to English. Only output the English translation, nothing else. The text is a sound effect description for AI audio generation. Keep the translation concise, vivid and descriptive.',
    },
    { role: 'user' as const, content: chineseText },
  ];

  const response = await client.invoke(messages, {
    model: 'doubao-seed-1-6-lite-251015',
    temperature: 0.3,
  });

  return response.content.trim();
}

// 提交音效生成任务
async function submitTask(params: SfxRequest) {
  const response = await fetch(GITEE_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITEE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: params.prompt,
      model: 'AudioFly',
      num_inference_steps: params.steps || 200,
      guidance_scale: params.guidanceScale || 3.5,
      output_format: params.outputFormat || 'mp3',
    }),
  });

  return response.json();
}

// 轮询任务状态
async function pollTask(taskId: string, maxAttempts: number = 60, interval: number = 5000): Promise<{ status: string; fileUrl?: string; error?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`https://ai.gitee.com/v1/task/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${GITEE_API_TOKEN}`,
        },
      });

      const result = await response.json();

      if (result.error) {
        return { status: 'failed', error: `${result.error}: ${result.message || 'Unknown error'}` };
      }

      const status = result.status;

      if (status === 'success') {
        const fileUrl = result.output?.file_url;
        return { status: 'success', fileUrl };
      } else if (status === 'failed' || status === 'cancelled') {
        return { status: 'failed', error: `任务${status}` };
      }

      // 仍在处理中，等待后重试
      await new Promise(resolve => setTimeout(resolve, interval));
    } catch (err) {
      console.error('[SFX] 轮询错误:', err);
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  return { status: 'timeout', error: '任务超时' };
}

// POST: 提交任务并轮询等待结果
export async function POST(request: NextRequest) {
  const body: SfxRequest = await request.json();
  const { prompt, steps, guidanceScale, outputFormat } = body;

  if (!prompt?.trim()) {
    return NextResponse.json({ error: '请输入音效描述' }, { status: 400 });
  }

  if (!GITEE_API_TOKEN) {
    return NextResponse.json({ error: '未配置 GITEE_API_TOKEN' }, { status: 500 });
  }

  console.log('[SFX] 原始提示词:', prompt);

  try {
    // 0. 翻译中文提示词为英文
    let englishPrompt = prompt;
    try {
      englishPrompt = await translateToEnglish(prompt, request.headers);
      console.log('[SFX] 翻译后提示词:', englishPrompt);
    } catch (translateErr) {
      console.warn('[SFX] 翻译失败，使用原始提示词:', translateErr);
    }

    // 1. 提交任务（使用英文提示词）
    const submitResult = await submitTask({ prompt: englishPrompt, steps, guidanceScale, outputFormat });
    const taskId = submitResult.task_id;

    if (!taskId) {
      console.error('[SFX] 提交失败:', submitResult);
      return NextResponse.json({ error: submitResult.error || submitResult.message || '任务提交失败' }, { status: 500 });
    }

    console.log('[SFX] 任务已提交, taskId:', taskId);

    // 2. 轮询等待结果
    const result = await pollTask(taskId);

    if (result.status === 'success' && result.fileUrl) {
      console.log('[SFX] 任务完成, fileUrl:', result.fileUrl);
      return NextResponse.json({
        success: true,
        audioUrl: result.fileUrl,
        taskId,
        originalPrompt: prompt,
        translatedPrompt: englishPrompt,
      });
    } else {
      console.error('[SFX] 任务失败:', result);
      return NextResponse.json({
        success: false,
        error: result.error || '音效生成失败',
        taskId,
      }, { status: 500 });
    }
  } catch (err) {
    console.error('[SFX] 生成错误:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : '音效生成失败',
    }, { status: 500 });
  }
}
