import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

const GITEE_API_URL = 'https://ai.gitee.com/v1/async/audio/speech';
const GITEE_API_TOKEN = process.env.GITEE_API_TOKEN || 'TZ2MDIJ9DO3MASXXKHIUUFUZMRGFB9JS7AZMBB4I';

export type SfxType = 'ambient' | 'fx' | 'music' | 'voice' | 'nature' | 'tech' | 'custom';

interface SfxRequest {
  prompt: string;
  sfxType?: SfxType;
  duration?: number;
  steps?: number;
  guidanceScale?: number;
  outputFormat?: string;
}

const SFX_TYPE_TEMPLATES: Record<SfxType, { prefix: string; defaultSteps: number; defaultGuidance: number }> = {
  ambient: {
    prefix: 'ambient soundscape, atmospheric background, immersive environment, subtle textures, ',
    defaultSteps: 250,
    defaultGuidance: 4.0,
  },
  fx: {
    prefix: 'sound effect, cinematic foley, impactful, punchy, precise, professional audio design, ',
    defaultSteps: 200,
    defaultGuidance: 3.5,
  },
  music: {
    prefix: 'background music, cinematic score, moody, emotional, melodic, instrumental, ',
    defaultSteps: 300,
    defaultGuidance: 5.0,
  },
  voice: {
    prefix: 'vocal sound, voice effect, human voice, speech, vocalization, ',
    defaultSteps: 200,
    defaultGuidance: 3.0,
  },
  nature: {
    prefix: 'natural sound, organic, environmental, outdoor, realistic nature recording, ',
    defaultSteps: 220,
    defaultGuidance: 3.8,
  },
  tech: {
    prefix: 'electronic sound, futuristic, technological, digital, synthesized, sci-fi, ',
    defaultSteps: 200,
    defaultGuidance: 4.2,
  },
  custom: {
    prefix: '',
    defaultSteps: 200,
    defaultGuidance: 3.5,
  },
};

const SFX_PRESETS: Record<string, string> = {
  'rain': 'Gentle rain falling on leaves and windows, soft patter, ambient atmosphere',
  'thunder': 'Deep rumbling thunder in the distance, echoing, dramatic impact',
  'wind': 'Whistling wind through trees, howling, atmospheric, natural',
  'birds': 'Morning birds chirping and singing in a forest, peaceful nature sound',
  'waves': 'Ocean waves crashing on shore, rhythmic, calming, coastal atmosphere',
  'fire': 'Crackling fire, burning wood, warm ambiance, fireplace',
  'footsteps': 'Footsteps on concrete floor, echoing in empty hallway, realistic foley',
  'glass-break': 'Glass shattering, breaking sound effect, sharp and crisp',
  'explosion': 'Dramatic explosion, deep bass impact, cinematic sound effect',
  'magic': 'Magical sparkling sound, ethereal, shimmering, fantasy',
  'digital': 'Digital glitch sound, futuristic tech, electronic beeps and pulses',
  'heartbeat': 'Slow steady heartbeat, pulsing, suspenseful, dramatic',
};

async function translateAndOptimizePrompt(chineseText: string, requestHeaders: Headers, sfxType: SfxType): Promise<string> {
  const config = new Config();
  const customHeaders = HeaderUtils.extractForwardHeaders(requestHeaders);
  const client = new LLMClient(config, customHeaders);

  const typeTemplate = SFX_TYPE_TEMPLATES[sfxType];

  const messages = [
    {
      role: 'system' as const,
      content: `You are a world-class sound designer and audio engineer specializing in AI audio generation.
Your task is to translate and optimize Chinese sound effect descriptions into professional English prompts for AudioFly AI audio generation model.

CRITICAL RULES:
1. OUTPUT ONLY the final English prompt - NO EXPLANATIONS, NO NOTES, NO QUOTATION MARKS
2. The prompt must be vivid, detailed, and optimized for audio generation
3. Use sound-specific vocabulary: timbre, pitch, volume, duration, texture, reverb, echo, distortion, etc.
4. Include onomatopoeia where appropriate: whoosh, crackle, rumble, sizzle, thud, etc.
5. Specify spatial characteristics: close-up, distant, echoing, muffled, immersive, stereo, surround
6. Describe emotional/mood qualities: dramatic, suspenseful, calm, intense, mysterious, joyful
7. Keep it concise but comprehensive - 1-3 sentences is ideal
8. Focus on WHAT the sound SOUNDS LIKE, not what causes it
9. ALWAYS include the type-specific prefix: "${typeTemplate.prefix}"

EXAMPLES:
- Chinese: "雨滴打在窗户上，远处有雷声"
  English: "${typeTemplate.prefix}Raindrops pattering against glass window pane with distant rumbling thunder, soft ambient atmosphere, natural soundscape"

- Chinese: "猫叫声"
  English: "${typeTemplate.prefix}A cat meowing softly, clear and close-up, realistic feline vocalization"

- Chinese: "森林里的鸟鸣"
  English: "${typeTemplate.prefix}Birds chirping and singing in a lush forest, natural ambient soundscape, peaceful and calming"

- Chinese: "爆炸声"
  English: "${typeTemplate.prefix}Dramatic explosion with deep bass impact, sharp crackling debris, cinematic sound effect, powerful and intense"`,
    },
    { role: 'user' as const, content: chineseText },
  ];

  const response = await client.invoke(messages, {
    model: 'doubao-seed-1-8-251228',
    temperature: 0.2,
  });

  let result = response.content.trim();
  
  if (!result.startsWith(typeTemplate.prefix)) {
    result = typeTemplate.prefix + result;
  }
  
  return result;
}

async function submitTask(params: SfxRequest) {
  const sfxType = params.sfxType || 'custom';
  const template = SFX_TYPE_TEMPLATES[sfxType];
  
  const response = await fetch(GITEE_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITEE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: params.prompt,
      model: 'AudioFly',
      num_inference_steps: params.steps || template.defaultSteps,
      guidance_scale: params.guidanceScale || template.defaultGuidance,
      duration: params.duration || 3,
      output_format: params.outputFormat || 'mp3',
    }),
  });

  return response.json();
}

async function pollTask(taskId: string, maxAttempts: number = 90, interval: number = 5000): Promise<{ status: string; fileUrl?: string; error?: string }> {
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

      await new Promise(resolve => setTimeout(resolve, interval));
    } catch (err) {
      console.error('[SFX] Polling error:', err);
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  return { status: 'timeout', error: '任务超时' };
}

export async function POST(request: NextRequest) {
  const body: SfxRequest = await request.json();
  const { prompt, sfxType = 'custom', duration, steps, guidanceScale, outputFormat } = body;

  if (!prompt?.trim()) {
    return NextResponse.json({ error: '请输入音效描述' }, { status: 400 });
  }

  if (!GITEE_API_TOKEN) {
    return NextResponse.json({ error: '未配置 GITEE_API_TOKEN' }, { status: 500 });
  }

  console.log('[SFX] Original prompt:', prompt, 'Type:', sfxType);

  try {
    let optimizedPrompt = prompt;
    let isTranslated = false;

    const isEnglish = /^[a-zA-Z0-9\s,.\-!?;:'"()]+$/.test(prompt.trim());
    
    if (!isEnglish) {
      try {
        optimizedPrompt = await translateAndOptimizePrompt(prompt, request.headers, sfxType);
        isTranslated = true;
        console.log('[SFX] Optimized prompt:', optimizedPrompt);
      } catch (translateErr) {
        console.warn('[SFX] Translation failed, using original prompt:', translateErr);
        const template = SFX_TYPE_TEMPLATES[sfxType];
        optimizedPrompt = template.prefix + prompt;
      }
    } else {
      const template = SFX_TYPE_TEMPLATES[sfxType];
      if (!prompt.startsWith(template.prefix)) {
        optimizedPrompt = template.prefix + prompt;
      }
    }

    const submitResult = await submitTask({ 
      prompt: optimizedPrompt, 
      sfxType, 
      duration, 
      steps, 
      guidanceScale, 
      outputFormat 
    });
    const taskId = submitResult.task_id;

    if (!taskId) {
      console.error('[SFX] Submit failed:', submitResult);
      return NextResponse.json({ error: submitResult.error || submitResult.message || '任务提交失败' }, { status: 500 });
    }

    console.log('[SFX] Task submitted, taskId:', taskId);

    const result = await pollTask(taskId);

    if (result.status === 'success' && result.fileUrl) {
      console.log('[SFX] Task completed, fileUrl:', result.fileUrl);
      return NextResponse.json({
        success: true,
        audioUrl: result.fileUrl,
        taskId,
        originalPrompt: prompt,
        translatedPrompt: optimizedPrompt,
        isTranslated,
        sfxType,
      });
    } else {
      console.error('[SFX] Task failed:', result);
      return NextResponse.json({
        success: false,
        error: result.error || '音效生成失败',
        taskId,
      }, { status: 500 });
    }
  } catch (err) {
    console.error('[SFX] Generation error:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : '音效生成失败',
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    presets: SFX_PRESETS,
    types: Object.keys(SFX_TYPE_TEMPLATES).map(key => ({
      value: key,
      label: {
        ambient: '环境音效',
        fx: '特效音效',
        music: '背景音乐',
        voice: '人声音效',
        nature: '自然音效',
        tech: '科技音效',
        custom: '自定义',
      }[key],
      description: {
        ambient: '氛围音、背景环境音',
        fx: '动作特效、电影音效',
        music: '背景音乐、配乐',
        voice: '人声、说话声',
        nature: '自然环境、户外声音',
        tech: '电子、科幻、数字音效',
        custom: '自定义描述',
      }[key],
    })),
  });
}
