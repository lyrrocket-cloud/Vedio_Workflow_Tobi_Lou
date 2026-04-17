import { NextRequest, NextResponse } from 'next/server';

// 火山引擎语音合成API配置
const VOLC_API_KEY = process.env.VOLC_API_KEY || 'be9ce267-c0d2-44b1-90f6-75964c4ec8fe';
const VOLC_BASE_URL = 'https://openspeech.bytedance.com/api/v1/tts';

// 音色ID
const VOICE_ID = 'S_Q3mBNb202';

// 轮询等待时间（毫秒）
const POLL_INTERVAL = 2000;
// 最大轮询次数
const MAX_POLL_COUNT = 15;

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json({ error: '请提供要合成的文本' }, { status: 400 });
    }

    // 生成唯一请求ID
    const reqid = `${Date.now()}${Math.random().toString(36).substring(2, 10)}`;

    // 1. 提交任务
    const submitResponse = await fetch(VOLC_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': VOLC_API_KEY,
      },
      body: JSON.stringify({
        app: {
          cluster: 'volcano_icl',
        },
        user: {
          uid: '豆包语音',
        },
        audio: {
          voice_type: VOICE_ID,
          encoding: 'mp3',
          speed_ratio: 1.0,
        },
        request: {
          reqid: reqid,
          text: text,
          operation: 'submit',
        },
      }),
    });

    const submitData = await submitResponse.json();
    console.log('提交任务响应:', submitData);

    if (submitData.code !== 3000) {
      return NextResponse.json(
        { error: submitData.message || '提交任务失败' },
        { status: 400 }
      );
    }

    // 2. 轮询查询结果
    for (let i = 0; i < MAX_POLL_COUNT; i++) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

      const queryResponse = await fetch(VOLC_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': VOLC_API_KEY,
        },
        body: JSON.stringify({
          app: {
            cluster: 'volcano_icl',
          },
          user: {
            uid: '豆包语音',
          },
          audio: {
            voice_type: VOICE_ID,
            encoding: 'mp3',
            speed_ratio: 1.0,
          },
          request: {
            reqid: reqid,
            text: text,
            operation: 'query',
          },
        }),
      });

      const queryData = await queryResponse.json();
      console.log(`轮询${i + 1}次:`, queryData.code, queryData.message);

      // code = 1000 表示成功完成
      if (queryData.code === 1000) {
        // 返回base64音频数据
        const audioData = queryData.data;
        return NextResponse.json({
          success: true,
          audioUrl: `data:audio/mp3;base64,${audioData}`,
          duration: queryData.addition?.duration,
        });
      }

      // code = 3000 表示还在处理中，继续轮询
      if (queryData.code === 3000) {
        continue;
      }

      // 其他错误码
      if (queryData.code !== 1000) {
        return NextResponse.json(
          { error: queryData.message || '查询失败' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: '生成超时，请重试' },
      { status: 500 }
    );

  } catch (error) {
    console.error('配音生成错误:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '配音生成失败' },
      { status: 500 }
    );
  }
}
