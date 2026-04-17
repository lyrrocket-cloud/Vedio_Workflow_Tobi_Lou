import { NextRequest, NextResponse } from 'next/server';

// 火山引擎语音合成API配置 (V1接口 - 因为音色是V1版本训练的)
const VOLC_API_KEY = process.env.VOLC_API_KEY || 'be9ce267-c0d2-44b1-90f6-75964c4ec8fe';
const VOLC_BASE_URL = 'https://openspeech.bytedance.com/api/v1/tts';

// 音色ID
const SPEAKER_ID = 'S_Q3mBNb202';

// 轮询配置
const POLL_INTERVAL = 2000; // 毫秒
const MAX_POLL_COUNT = 30;

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json({ error: '请提供要合成的文本' }, { status: 400 });
    }

    // 生成唯一请求ID
    const reqid = `${Date.now()}${Math.random().toString(36).substring(2, 10)}`;

    console.log('开始配音生成，请求ID:', reqid, '文本:', text);

    // 1. 提交合成任务
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
          uid: 'voice_clone_user',
        },
        audio: {
          voice_type: SPEAKER_ID,
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
    console.log('提交任务响应:', JSON.stringify(submitData));

    // 成功码是 3000
    if (submitData.code !== 3000) {
      return NextResponse.json(
        { error: submitData.message || `提交失败: ${submitData.code}` },
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
            uid: 'voice_clone_user',
          },
          audio: {
            voice_type: SPEAKER_ID,
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
      console.log(`轮询${i + 1}次: code=${queryData.code}, message=${queryData.message}`);

      // code = 1000 表示成功完成
      if (queryData.code === 1000) {
        const audioData = queryData.data;
        console.log('获取到音频数据, 长度:', audioData?.length);
        return NextResponse.json({
          success: true,
          audioUrl: `data:audio/mp3;base64,${audioData}`,
          duration: queryData.addition?.duration,
        });
      }

      // code = 3000 表示成功（查询到结果但还在处理）
      if (queryData.code === 3000) {
        continue;
      }

      // 其他错误码
      return NextResponse.json(
        { error: queryData.message || `查询失败: ${queryData.code}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: '生成超时，请重试' }, { status: 500 });

  } catch (error) {
    console.error('配音生成错误:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '配音生成失败' },
      { status: 500 }
    );
  }
}
