'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, Upload, Play, ArrowRight, Sparkles, Download, Image as ImageIcon, CheckCircle, Clock, Eye, XCircle, Monitor, RefreshCw, StopCircle, Video, ChevronDown, ChevronUp, Info, Trash2, Settings, Bot, Server, Mic, Volume2, FileText, Activity, Subtitles, FileVideo2, AudioLines } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface UploadResponse {
  success: boolean;
  url?: string;
  error?: string;
}

interface UploadResponse {
  success: boolean;
  url?: string;
  error?: string;
}

// 监控任务类型
interface MonitorTask {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  videoUrl?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  elapsed: number;
  params: {
    duration: number;
    resolution: string;
    ratio: string;
  };
}

interface MonitorStats {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
}

export default function TransitionVideoGenerator() {
  const [firstFrame, setFirstFrame] = useState<File | null>(null);
  const [lastFrame, setLastFrame] = useState<File | null>(null);
  const [firstFramePreview, setFirstFramePreview] = useState<string>('');
  const [lastFramePreview, setLastFramePreview] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('视频必须严格从首帧图片开始，平滑过渡到尾帧图片结束。确保视频的第一帧与首帧图片完全相同，最后一帧与尾帧图片完全相同，中间过程自然流畅地过渡变化。');
  const [duration, setDuration] = useState<number>(5);
  const [resolution, setResolution] = useState<string>('720p');
  const [ratio, setRatio] = useState<string>('16:9');
  const [generateAudio] = useState<boolean>(true); // 默认生成音频
  const [mockMode, setMockMode] = useState<boolean>(false);
  const [asyncMode, setAsyncMode] = useState<boolean>(true); // 默认使用异步模式

  const [selectedModel, setSelectedModel] = useState<'coze' | 'ark'>('ark'); // 模型选择
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [error, setError] = useState<string>('');
  
  // 配音生成状态
  const [voiceText, setVoiceText] = useState<string>('');
  const [isGeneratingVoice, setIsGeneratingVoice] = useState<boolean>(false);
  const [voiceError, setVoiceError] = useState<string>('');
  const [voiceHistory, setVoiceHistory] = useState<Array<{id: string; text: string; url: string; time: string}>>([]);

  // 音效生成状态
  const [sfxPrompt, setSfxPrompt] = useState<string>('');
  const [sfxType, setSfxType] = useState<string>('custom');
  const [sfxSteps, setSfxSteps] = useState<number>(200);
  const [sfxGuidanceScale, setSfxGuidanceScale] = useState<number>(3.5);
  const [isGeneratingSfx, setIsGeneratingSfx] = useState<boolean>(false);
  const [sfxError, setSfxError] = useState<string>('');
  const [sfxHistory, setSfxHistory] = useState<Array<{id: string; prompt: string; translatedPrompt: string; url: string; time: string}>>([]);

  // 字幕生成状态
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [subtitleFileName, setSubtitleFileName] = useState<string>('');
  const [isGeneratingSubtitle, setIsGeneratingSubtitle] = useState<boolean>(false);
  const [subtitleError, setSubtitleError] = useState<string>('');
  const [subtitleFormat, setSubtitleFormat] = useState<'srt' | 'fcpxml'>('srt');
  const [subtitleFrameRate, setSubtitleFrameRate] = useState<string>('30');
  const [subtitleSegments, setSubtitleSegments] = useState<Array<{id: number; start: number; end: number; text: string}>>([]);
  const [subtitleContent, setSubtitleContent] = useState<string>('');
  const [subtitleHistory, setSubtitleHistory] = useState<Array<{id: string; fileName: string; format: string; segments: number; time: string; content: string; downloadName: string}>>([]);

  const [previewMonitorVideo, setPreviewMonitorVideo] = useState<{ url: string; params: { duration: number; resolution: string; ratio: string } } | null>(null);
  const [canCancel, setCanCancel] = useState<boolean>(false);


  // Monitor state - 常驻底部显示
  const [monitorTasks, setMonitorTasks] = useState<MonitorTask[]>([]);
  const [monitorStats, setMonitorStats] = useState<MonitorStats>({ total: 0, queued: 0, running: 0, succeeded: 0, failed: 0 });
  const [monitorLoading, setMonitorLoading] = useState<boolean>(false);
  const monitorPollRef = useRef<NodeJS.Timeout | null>(null);

  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const lastFrameInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 初始化任务监控 - 自动开始轮询（仅在异步模式下）
  useEffect(() => {
    if (asyncMode) {
      // 立即获取一次
      fetchMonitorTasks();
      // 每10秒刷新一次
      monitorPollRef.current = setInterval(() => {
        fetchMonitorTasks();
      }, 10000);
    }
    
    return () => {
      if (monitorPollRef.current) {
        clearInterval(monitorPollRef.current);
        monitorPollRef.current = null;
      }
    };
  }, [asyncMode]);

  const handleImageUpload = useCallback((
    file: File,
    setFile: (file: File | null) => void,
    setPreview: (preview: string) => void
  ) => {
    if (file && file.type.startsWith('image/')) {
      setFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // 生成配音
  const handleGenerateVoice = async () => {
    if (!voiceText.trim()) {
      setVoiceError('请输入要生成的文本');
      return;
    }

    setIsGeneratingVoice(true);
    setVoiceError('');

    // 生成任务ID
    const taskId = `voice_${Date.now()}`;

    try {
      // 调用配音生成API
      const response = await fetch('/api/voice-clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: voiceText,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '配音生成失败');
      }

      // 添加到历史记录
      setVoiceHistory(prev => [{
        id: taskId,
        text: voiceText.substring(0, 20) + (voiceText.length > 20 ? '...' : ''),
        url: data.audioUrl,
        time: new Date().toLocaleTimeString(),
      }, ...prev].slice(0, 10)); // 保留最近10条
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '配音生成失败';
      setVoiceError(errorMessage);
      console.error('配音生成错误:', err);
    } finally {
      setIsGeneratingVoice(false);
    }

  };

  // 字幕生成
  const handleGenerateSubtitle = async () => {
    if (!subtitleFile) {
      setSubtitleError('请上传视频或音频文件');
      return;
    }

    setIsGeneratingSubtitle(true);
    setSubtitleError('');
    setSubtitleSegments([]);
    setSubtitleContent('');

    const taskId = `subtitle_${Date.now()}`;

    try {
      // Step 1: 分块上传文件到 S3（绕过反向代理 body size 限制）
      const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per chunk
      const totalChunks = Math.ceil(subtitleFile.size / CHUNK_SIZE);
      const uploadId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, subtitleFile.size);
        const chunkBlob = subtitleFile.slice(start, end);

        const chunkFormData = new FormData();
        chunkFormData.append('uploadId', uploadId);
        chunkFormData.append('chunkIndex', String(i));
        chunkFormData.append('totalChunks', String(totalChunks));
        chunkFormData.append('chunk', chunkBlob, subtitleFile.name);

        const chunkResponse = await fetch('/api/upload-chunk', {
          method: 'POST',
          body: chunkFormData,
        });

        const chunkData = await chunkResponse.json();
        if (!chunkResponse.ok || !chunkData.success) {
          throw new Error(`分块 ${i + 1}/${totalChunks} 上传失败: ${chunkData.error || '未知错误'}`);
        }
      }

      // Step 2: 组装分块并上传到 S3
      const completeResponse = await fetch('/api/upload-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          fileName: subtitleFile.name,
          contentType: subtitleFile.type,
        }),
      });

      const completeData = await completeResponse.json();
      if (!completeResponse.ok || !completeData.success) {
        throw new Error(completeData.error || '文件组装上传失败');
      }

      const videoUrl = completeData.url;

      // Step 3: 调用转写 API
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl,
          format: subtitleFormat,
          frameRate: subtitleFrameRate,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || '字幕生成失败');
      }

      setSubtitleSegments(data.segments);
      setSubtitleContent(data.content);

      if (data.warning) {
        setSubtitleError(data.warning);
      }

      setSubtitleHistory(prev => [{
        id: taskId,
        fileName: subtitleFileName,
        format: subtitleFormat,
        segments: data.segments.length,
        time: new Date().toLocaleTimeString(),
        content: data.content,
        downloadName: data.downloadName,
      }, ...prev].slice(0, 10));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '字幕生成失败';
      setSubtitleError(errorMessage);
      console.error('字幕生成错误:', err);
    } finally {
      setIsGeneratingSubtitle(false);
    }
  };

  const handleSubtitleFileUpload = useCallback((file: File) => {
    if (file && (file.type.startsWith('video/') || file.type.startsWith('audio/') || file.name.match(/\.(mp4|mov|avi|mkv|mp3|wav|m4a|flac)$/i))) {
      setSubtitleFile(file);
      setSubtitleFileName(file.name);
      setSubtitleSegments([]);
      setSubtitleContent('');
      setSubtitleError('');
    }
  }, []);

  const downloadSubtitle = (content: string, fileName: string, format: string) => {
    const blob = new Blob([content], { type: format === 'fcpxml' ? 'application/xml' : 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const formatTimeDisplay = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleDrop = useCallback((
    e: React.DragEvent,
    setFile: (file: File | null) => void,
    setPreview: (preview: string) => void
  ) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleImageUpload(file, setFile, setPreview);
    }
  }, [handleImageUpload]);

  // 获取任务列表
  const fetchMonitorTasks = useCallback(async () => {
    try {
      const response = await fetch('/api/video-tasks');
      const data = await response.json();
      if (data.success) {
        setMonitorTasks(data.tasks);
        setMonitorStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    }
  }, []);

  // 取消任务
  const cancelTask = useCallback(async (taskId: string) => {
    try {
      const response = await fetch(`/api/video-cancel/${taskId}`, { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        // 刷新任务列表
        await fetchMonitorTasks();
      } else {
        setError(data.error || '取消任务失败');
      }
    } catch (err) {
      setError('取消任务失败');
    }
  }, [fetchMonitorTasks]);

  // 删除任务
  const deleteTaskItem = useCallback(async (taskId: string) => {
    try {
      const response = await fetch(`/api/video-delete/${taskId}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        // 刷新任务列表
        await fetchMonitorTasks();
      } else {
        setError(data.message || '删除任务失败');
      }
    } catch (err) {
      setError('删除任务失败');
    }
  }, [fetchMonitorTasks]);

  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    const data: UploadResponse = await response.json();
    if (!data.success || !data.url) {
      throw new Error(data.error || '上传失败');
    }
    return data.url;
  };

  // 异步模式生成视频
  const handleGenerateAsync = async (firstFrameUrl: string | undefined, lastFrameUrl: string | undefined) => {
    // 提交任务
    const submitResponse = await fetch('/api/generate-video-async', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstFrameUrl,
        lastFrameUrl,
        prompt,
        duration,
        resolution,
        ratio,
        generateAudio,
        mockMode,
      }),
    });

    const submitData = await submitResponse.json();

    if (!submitData.success || !submitData.taskId) {
      throw new Error(submitData.error || '任务提交失败');
    }

    const taskId = submitData.taskId;

    // 连接SSE监听状态
    const sseResponse = await fetch(`/api/video-status-sse/${taskId}`, {
      signal: abortControllerRef.current?.signal,
    });

    if (!sseResponse.ok) {
      throw new Error('无法连接状态监听');
    }

    const reader = sseResponse.body?.getReader();
    if (!reader) {
      throw new Error('无法获取状态流');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          const eventMatch = line.match(/^event: (\w+)\ndata: ([\s\S]+)$/);
          if (eventMatch) {
            const eventType = eventMatch[1];
            const data = JSON.parse(eventMatch[2]);

            if (eventType === 'complete') {
              const newVideoUrl = data.videoUrl;
              setVideoUrl(newVideoUrl);
            } else if (eventType === 'error') {
              setError(data.error || data.message);
            }
          }
        }
      }
    }
  };

  const handleGenerate = async () => {
    // 检查是否至少有一个帧图片或提示词
    if (!firstFrame && !lastFrame && !prompt.trim()) {
      setError('请上传首帧/结束帧图片或输入提示词');
      return;
    }

    setIsGenerating(true);
    setError('');
    setVideoUrl('');
    setCanCancel(true);

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      let firstFrameUrl: string | undefined;
      let lastFrameUrl: string | undefined;

      // 如果有首帧则上传
      if (firstFrame) {
        firstFrameUrl = await uploadImage(firstFrame);
      }

      // 如果有结束帧则上传
      if (lastFrame) {
        lastFrameUrl = await uploadImage(lastFrame);
      }

      // 构建动态提示词
      let finalPrompt = prompt;
      if (firstFrameUrl && lastFrameUrl) {
        // 有首帧和结束帧：使用默认提示词逻辑
        finalPrompt = `视频必须严格从首帧图片开始，平滑过渡到结束帧图片结束。确保视频的第一帧与首帧图片完全相同，最后一帧与结束帧图片完全相同，中间过程自然流畅地过渡变化。${prompt}`;
      } else if (firstFrameUrl) {
        // 只有首帧
        finalPrompt = `视频必须从首帧图片开始生成，第一帧必须与首帧图片完全相同。${prompt}`;
      } else if (lastFrameUrl) {
        // 只有结束帧
        finalPrompt = `视频必须平滑过渡到结束帧图片，最后一帧必须与结束帧图片完全相同。${prompt}`;
      }

      // 根据选择的模型选择生成方式
      if (selectedModel === 'ark') {
        // 火山方舟Ark模型
        await handleGenerateArk(firstFrameUrl, lastFrameUrl, finalPrompt);
      } else {
        // Coze模型
        if (asyncMode) {
          // 异步模式：提交任务后立即返回，通过SSE监听状态
          await handleGenerateAsync(firstFrameUrl, lastFrameUrl);
        } else {
          // 同步模式：使用SSE阻塞等待
          await handleGenerateSync(firstFrameUrl, lastFrameUrl);
        }
      }
    } catch (err) {
      // Handle abort error
      if (err instanceof Error && err.name === 'AbortError') {
        setError('用户取消了视频生成');
      } else {
        const errorMessage = err instanceof Error ? err.message : '发生错误';
        setError(errorMessage);
      }
    } finally {
      setIsGenerating(false);
      setCanCancel(false);
      abortControllerRef.current = null;
    }
  };

  // 火山方舟Ark模型生成视频
  const handleGenerateArk = async (firstFrameUrl: string | undefined, lastFrameUrl: string | undefined, finalPrompt: string) => {
    const response = await fetch('/api/generate-video-ark', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firstFrameUrl,
        lastFrameUrl,
        prompt: finalPrompt,
        duration,
        resolution,
        ratio,
        generateAudio,
      }),
      signal: abortControllerRef.current?.signal,
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    if (data.videoUrl) {
      setVideoUrl(data.videoUrl);
    } else {
      // 如果有taskId，查询状态
      if (data.taskId) {
        // 等待任务完成
        setError('Ark模型任务已提交，请等待处理完成...');
      }
    }
  };

  // 同步模式生成视频
  const handleGenerateSync = async (firstFrameUrl: string | undefined, lastFrameUrl: string | undefined) => {
    const response = await fetch('/api/generate-video-sse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firstFrameUrl,
        lastFrameUrl,
        prompt,
        duration,
        resolution,
        ratio,
        generateAudio,
        mockMode,
      }),
      signal: abortControllerRef.current?.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          const eventMatch = line.match(/^event: (\w+)\ndata: ([\s\S]+)$/);
          if (eventMatch) {
            const eventType = eventMatch[1];
            const rawData = eventMatch[2];
            let data;
            try {
              data = JSON.parse(rawData);
            } catch (e) {
              continue;
            }

            if (eventType === 'complete') {
              const newVideoUrl = data.videoUrl as string;
              const newTotalTime = data.totalTime as number;
              setVideoUrl(newVideoUrl);
            } else if (eventType === 'error') {
              setError(data.message as string);
            }
          }
        }
      }
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleDownload = async () => {
    if (!videoUrl) return;

    try {
      // 使用后端代理下载，避免CORS问题
      const response = await fetch(`/api/download-video?url=${encodeURIComponent(videoUrl)}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '下载视频失败');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `转场视频-${Date.now()}.mp4`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '下载视频失败';
      setError(errorMessage);
      console.error('下载失败:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] bg-cover bg-center bg-fixed bg-no-repeat relative" style={{ backgroundImage: 'url(https://code.coze.cn/api/sandbox/coze_coding/file/proxy?expire_time=-1&file_path=assets%2F20260226-113651.jpg&nonce=a15fb89a-7b6f-42f5-96a2-cabae4250535&project_id=7621104939930222628&sign=c5833d8e5d38ee15db957f67079aaae1ebebd3d2a5afee749e7fa9a00398639c)' }}>
      {/* 背景遮罩层 */}
      <div className="absolute inset-0 bg-[#0a0a0f]/80" />
      
      <div className="container mx-auto px-4 py-8 max-w-4xl relative z-10">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex flex-col items-center justify-center gap-4 mb-4">
            {/* 图标容器 - 金色衬底 + 黑色线框 */}
            <div
              className="w-20 h-20 flex items-center justify-center rounded-2xl"
              style={{
                backgroundColor: '#CEA472',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2)'
              }}
            >
              <Video className="w-10 h-10" style={{ color: '#0a0a0f' }} />
            </div>

            {/* 主标题 */}
            <h1 className="text-5xl font-bold text-white drop-shadow-lg">
              视频工作流
            </h1>
          </div>
        </div>

        <Tabs defaultValue="video" className="space-y-6">
          {/* 工作流Tab切换 */}
          <TabsList className="grid w-full grid-cols-4 bg-black/40 backdrop-blur-sm border border-[#CEA472]/20">
            <TabsTrigger 
              value="video" 
              className="data-[state=active]:text-[#CEA472] data-[state=active]:bg-black/60 text-[#FFFFFF]/60 hover:text-[#FFFFFF]/80 transition-all duration-300"
            >
              <Video className="w-4 h-4 mr-2" />
              视频生成
            </TabsTrigger>
            <TabsTrigger 
              value="voiceover" 
              className="data-[state=active]:text-[#CEA472] data-[state=active]:bg-black/60 text-[#FFFFFF]/60 hover:text-[#FFFFFF]/80 transition-all duration-300"
            >
              <Mic className="w-4 h-4 mr-2" />
              配音生成
            </TabsTrigger>
            <TabsTrigger 
              value="sfx" 
              className="data-[state=active]:text-[#CEA472] data-[state=active]:bg-black/60 text-[#FFFFFF]/60 hover:text-[#FFFFFF]/80 transition-all duration-300"
            >
              <Volume2 className="w-4 h-4 mr-2" />
              音效生成
            </TabsTrigger>
            <TabsTrigger 
              value="subtitle" 
              className="data-[state=active]:text-[#CEA472] data-[state=active]:bg-black/60 text-[#FFFFFF]/60 hover:text-[#FFFFFF]/80 transition-all duration-300"
            >
              <Subtitles className="w-4 h-4 mr-2" />
              字幕生成
            </TabsTrigger>
          </TabsList>

          {/* 视频生成Tab */}
          <TabsContent value="video" className="space-y-6 mt-0">
            {/* Image Upload Section */}
            <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
              <CardHeader>
                <CardTitle className="text-[#FFFFFF] flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-[#CEA472]" />
                  帧图片上传
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {/* First Frame */}
                  <div
                    className={`relative aspect-video rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer ${
                      firstFramePreview 
                        ? 'border-[#CEA472] bg-black/60' 
                        : 'border-[#CEA472]/30 hover:border-[#CEA472]/60 bg-black/40'
                    }`}
                    onDrop={(e) => handleDrop(e, setFirstFrame, setFirstFramePreview)}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => firstFrameInputRef.current?.click()}
                  >
                    {firstFramePreview ? (
                      <img 
                        src={firstFramePreview} 
                        alt="首帧" 
                        className="w-full h-full object-cover rounded-xl"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-[#FFFFFF]/50">
                        <Upload className="w-8 h-8 mb-2" />
                        <span className="text-sm font-medium">首帧图片</span>
                        <span className="text-xs mt-1">点击或拖拽上传（可选）</span>
                      </div>
                    )}
                    <input
                      ref={firstFrameInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file, setFirstFrame, setFirstFramePreview);
                      }}
                    />
                  </div>

                  {/* Last Frame */}
                  <div
                    className={`relative aspect-video rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer ${
                      lastFramePreview 
                        ? 'border-[#CEA472] bg-black/60' 
                        : 'border-[#CEA472]/30 hover:border-[#CEA472]/60 bg-black/40'
                    }`}
                    onDrop={(e) => handleDrop(e, setLastFrame, setLastFramePreview)}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => lastFrameInputRef.current?.click()}
                  >
                    {lastFramePreview ? (
                      <img 
                        src={lastFramePreview} 
                        alt="尾帧" 
                        className="w-full h-full object-cover rounded-xl"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-[#FFFFFF]/50">
                        <Upload className="w-8 h-8 mb-2" />
                        <span className="text-sm font-medium">结束帧图片</span>
                        <span className="text-xs mt-1">点击或拖拽上传（可选）</span>
                      </div>
                    )}
                    <input
                      ref={lastFrameInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file, setLastFrame, setLastFramePreview);
                      }}
                    />
                  </div>
                </div>

                {/* Transition Arrow */}
                {firstFramePreview && lastFramePreview && (
                  <div className="flex items-center justify-center mt-4 text-[#CEA472]">
                    <div className="flex items-center gap-2 bg-[#CEA472]/10 border border-[#CEA472]/30 px-4 py-2 rounded-full">
                      <span className="text-sm">起始帧</span>
                      <ArrowRight className="w-4 h-4" />
                      <span className="text-sm">结束帧</span>
                    </div>
                  </div>
                )}

                {/* 转场描述输入框 */}
                <div className="mt-4">
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="输入转场描述，例如：人物从左边走向右边，背景逐渐变化"
                    className="min-h-[80px] bg-black/40 border-[#CEA472]/20 text-[#FFFFFF] placeholder:text-[#FFFFFF]/40 resize-none focus:border-[#CEA472]/60 focus:ring-[#CEA472]/20"
                  />
                </div>

                {/* 生成视频按钮 */}
                <div className="mt-4">
                  <Button
                    onClick={handleGenerate}
                    disabled={!prompt || isGenerating}
                    className="w-full h-12 bg-[#CEA472] hover:bg-[#CEA472]/90 text-[#0a0a0f] font-semibold rounded-xl transition-all duration-300 disabled:opacity-50"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        生成中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 mr-2" />
                        生成视频
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Settings Section */}
            <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
              <CardHeader className="pb-3">
                <CardTitle className="text-[#FFFFFF] flex items-center gap-2">
                  <Settings className="w-5 h-5 text-[#CEA472]" />
                  生成设置
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Duration */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-[#FFFFFF]/80">视频时长</Label>
                    <span className="text-[#CEA472] font-medium">{duration}秒</span>
                  </div>
                  <Slider
                    value={[duration]}
                    onValueChange={(value) => setDuration(value[0])}
                    min={4}
                    max={12}
                    step={1}
                    className="w-full"
                  />
                </div>

                {/* Resolution & Ratio */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[#FFFFFF]/80">分辨率</Label>
                    <Select value={resolution} onValueChange={setResolution}>
                      <SelectTrigger className="w-full bg-black/40 backdrop-blur-sm border-[#CEA472]/30 text-[#FFFFFF] focus:border-[#CEA472]/50 focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" className="bg-black/60 backdrop-blur-sm border-[#CEA472]/30 min-w-[var(--radix-select-trigger-width)]">
                        <SelectItem value="480p" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">480p</SelectItem>
                        <SelectItem value="720p" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">720p</SelectItem>
                        <SelectItem value="1080p" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">1080p</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[#FFFFFF]/80">宽高比</Label>
                    <Select value={ratio} onValueChange={setRatio}>
                      <SelectTrigger className="w-full bg-black/40 backdrop-blur-sm border-[#CEA472]/30 text-[#FFFFFF] focus:border-[#CEA472]/50 focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" className="bg-black/60 backdrop-blur-sm border-[#CEA472]/30 min-w-[var(--radix-select-trigger-width)]">
                        <SelectItem value="16:9" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">16:9</SelectItem>
                        <SelectItem value="9:16" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">9:16</SelectItem>
                        <SelectItem value="1:1" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">1:1</SelectItem>
                        <SelectItem value="4:3" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">4:3</SelectItem>
                        <SelectItem value="3:4" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">3:4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Model Selection Tabs */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-[#CEA472]" />
                    <Label className="text-[#FFFFFF]/80">选择模型</Label>
                  </div>
                  <Tabs 
                    value={selectedModel} 
                    onValueChange={(value) => setSelectedModel(value as 'coze' | 'ark')} 
                    className="w-full"
                  >
                    <TabsList className="grid w-full grid-cols-2 bg-black/20 backdrop-blur-sm border border-[#CEA472]/20 rounded-lg p-1">
                      <TabsTrigger 
                        value="coze" 
                        className="data-[state=active]:text-[#CEA472] data-[state=active]:bg-black/60 data-[state=active]:shadow-sm text-[#FFFFFF]/40 hover:text-[#FFFFFF]/70 transition-all duration-300 rounded-md"
                      >
                        <Bot className="w-4 h-4 mr-2" />
                        Coze Seedance1.5 Pro
                      </TabsTrigger>
                      <TabsTrigger 
                        value="ark" 
                        className="data-[state=active]:text-[#CEA472] data-[state=active]:bg-black/60 data-[state=active]:shadow-sm text-[#FFFFFF]/40 hover:text-[#FFFFFF]/70 transition-all duration-300 rounded-md"
                      >
                        <Server className="w-4 h-4 mr-2" />
                        Ark Seedance1.5 Pro
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {/* Mock Mode Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-[#CEA472]/5 border border-[#CEA472]/20">
                  <div>
                    <Label className="text-[#CEA472]/80 flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      模拟模式
                    </Label>
                    <p className="text-xs text-[#FFFFFF]/50 mt-1">无API权限时可用于测试流程</p>
                  </div>
                  <Switch
                    checked={mockMode}
                    onCheckedChange={setMockMode}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Task Monitor - 移至主区域顶部 */}
            {true && (
              <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
                <CardHeader>
                  <CardTitle className="text-[#FFFFFF] flex items-center gap-2">
                    <Activity className="w-5 h-5 text-[#CEA472]" />
                    任务监控
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {monitorLoading && monitorTasks.length === 0 ? (
                    <div className="bg-black/40 border border-[#CEA472]/20 rounded-xl p-8 text-center">
                      <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin text-[#CEA472]" />
                      <p className="text-[#FFFFFF]/40 text-sm">加载任务列表...</p>
                    </div>
                  ) : monitorTasks.length === 0 ? (
                    <div className="bg-black/40 border border-[#CEA472]/20 rounded-xl p-8 text-center">
                      <p className="text-[#FFFFFF]/40 text-sm">暂无任务记录</p>
                      <p className="text-[#FFFFFF]/30 text-xs mt-1">生成视频后将显示在这里</p>
                    </div>
                  ) : (
                    <div className="bg-black/40 border border-[#CEA472]/20 rounded-xl overflow-hidden">
                      <div className="max-h-[300px] overflow-y-scroll pr-1">
                        {monitorTasks.map((task) => (
                          <div
                            key={task.id}
                            className="flex items-center gap-3 p-3 border-b border-[#CEA472]/10 last:border-b-0 hover:bg-black/30 transition-colors"
                          >
                            <span className="text-[#CEA472] shrink-0">
                              {task.status === 'running' && <Loader2 className="w-4 h-4 animate-spin" />}
                              {task.status === 'queued' && <Clock className="w-4 h-4" />}
                              {task.status === 'succeeded' && <CheckCircle className="w-4 h-4" />}
                              {task.status === 'failed' && <XCircle className="w-4 h-4" />}
                              {task.status === 'cancelled' && <StopCircle className="w-4 h-4" />}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[#FFFFFF] text-sm truncate">
                                {task.params.duration}秒 | {task.params.resolution} | {task.params.ratio}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  task.status === 'running'
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : task.status === 'succeeded'
                                    ? 'bg-green-500/20 text-green-400'
                                    : task.status === 'failed'
                                    ? 'bg-red-500/20 text-red-400'
                                    : task.status === 'cancelled'
                                    ? 'bg-gray-500/20 text-gray-400'
                                    : 'bg-yellow-500/20 text-yellow-400'
                                }`}>
                                  {task.status === 'queued' ? '排队中' :
                                   task.status === 'running' ? '运行中' :
                                   task.status === 'succeeded' ? '已完成' :
                                   task.status === 'failed' ? '失败' : '已取消'}
                                </span>
                                <span className="text-[#FFFFFF]/40 text-xs">{task.elapsed}秒前</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {task.status === 'succeeded' && task.videoUrl && (
                                <Button
                                  onClick={() => setPreviewMonitorVideo({
                                    url: task.videoUrl!,
                                    params: {
                                      duration: task.params.duration,
                                      resolution: task.params.resolution,
                                      ratio: task.params.ratio
                                    }
                                  })}
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 hover:bg-[#CEA472]/20 text-[#CEA472]"
                                  title="查看"
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              )}
                              {task.status === 'succeeded' && task.videoUrl && (
                                <Button
                                  onClick={async () => {
                                    try {
                                      const response = await fetch(`/api/download-video?url=${encodeURIComponent(task.videoUrl!)}`);
                                      if (!response.ok) {
                                        const errorData = await response.json();
                                        throw new Error(errorData.error || '下载失败');
                                      }
                                      const blob = await response.blob();
                                      const url = window.URL.createObjectURL(blob);
                                      const link = document.createElement('a');
                                      link.href = url;
                                      link.download = `视频_${task.id.slice(0, 8)}.mp4`;
                                      link.click();
                                      window.URL.revokeObjectURL(url);
                                    } catch (err) {
                                      console.error('Download failed:', err);
                                    }
                                  }}
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 hover:bg-[#CEA472]/20 text-[#CEA472]"
                                  title="下载"
                                >
                                  <Download className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                onClick={() => setMonitorTasks(prev => prev.filter(t => t.id !== task.id))}
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-red-500/10 text-red-500"
                                title="删除"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                              {(task.status === 'queued' || task.status === 'running') && (
                                <Button
                                  onClick={() => cancelTask(task.id)}
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 hover:bg-red-500/10 text-red-500"
                                  title="取消"
                                >
                                  <StopCircle className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          </TabsContent>

          {/* 配音生成Tab */}
          <TabsContent value="voiceover" className="space-y-6 mt-0">
            {/* 第一栏：文本输入 */}
            <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
              <CardHeader>
                <CardTitle className="text-[#FFFFFF] flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#CEA472]" />
                  文本输入
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={voiceText}
                  onChange={(e) => setVoiceText(e.target.value)}
                  placeholder="输入要生成的配音内容..."
                  className="min-h-[120px] bg-black/40 backdrop-blur-sm border-[#CEA472]/30 text-[#FFFFFF] placeholder:text-[#FFFFFF]/50 focus:border-[#CEA472]/50 focus:ring-0 resize-none"
                />
                <Button
                  onClick={handleGenerateVoice}
                  disabled={isGeneratingVoice || !voiceText.trim()}
                  className="w-full h-12 bg-[#CEA472] hover:bg-[#CEA472]/80 text-[#0a0a0f] border-[#CEA472]/20 shadow-lg font-semibold rounded-xl transition-all duration-300 disabled:opacity-50"
                >
                  {isGeneratingVoice ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      正在生成...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      生成配音
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* 第二栏：音色设置 */}
            <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
              <CardHeader>
                <CardTitle className="text-[#FFFFFF] flex items-center gap-2">
                  <Settings className="w-5 h-5 text-[#CEA472]" />
                  音色设置
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 音色信息 */}
                <div className="bg-black/40 border border-[#CEA472]/30 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <Mic className="w-6 h-6 text-[#CEA472]" />
                    <div>
                      <p className="text-[#FFFFFF] text-sm font-medium">tobi_lou 音色</p>
                      <p className="text-[#FFFFFF]/50 text-xs mt-0.5">音色ID: S_Q3mBNb202</p>
                    </div>
                  </div>
                </div>

                {/* 错误提示 */}
                {voiceError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                    {voiceError}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 第三栏：任务监控 */}
            <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
              <CardHeader>
                <CardTitle className="text-[#FFFFFF] flex items-center gap-2">
                  <Activity className="w-5 h-5 text-[#CEA472]" />
                  任务监控
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* 任务历史 */}
                {voiceHistory.length > 0 ? (
                  <div className="space-y-2 max-h-[400px] overflow-y-scroll pr-1">
                      {voiceHistory.map((item) => (
                        <div 
                          key={item.id}
                          className="flex items-center gap-3 bg-black/40 border border-[#CEA472]/20 rounded-xl p-3 hover:border-[#CEA472]/40 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-[#FFFFFF]/80 truncate">{item.text}</p>
                            <p className="text-xs text-[#FFFFFF]/40 mt-0.5">{item.time}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <audio 
                              id={`voice-audio-${item.id}`}
                              src={item.url} 
                              preload="none"
                              onEnded={() => {
                                const btn = document.getElementById(`voice-btn-${item.id}`);
                                if (btn) btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
                              }}
                            />
                            <button
                              id={`voice-btn-${item.id}`}
                              onClick={(e) => {
                                const audio = document.getElementById(`voice-audio-${item.id}`) as HTMLAudioElement;
                                if (audio) {
                                  document.querySelectorAll('audio').forEach(a => {
                                    if (a !== audio) a.pause();
                                  });
                                  if (audio.paused) {
                                    audio.play();
                                    e.currentTarget.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
                                  } else {
                                    audio.pause();
                                    e.currentTarget.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
                                  }
                                }
                              }}
                              className="p-2 hover:bg-[#CEA472]/20 rounded-full transition-colors shrink-0 text-[#CEA472]"
                              title="预览"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                              </svg>
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const response = await fetch(item.url);
                                  const blob = await response.blob();
                                  const blobUrl = window.URL.createObjectURL(blob);
                                  const link = document.createElement('a');
                                  link.href = blobUrl;
                                  link.download = `配音-${item.id}.mp3`;
                                  link.click();
                                  window.URL.revokeObjectURL(blobUrl);
                                } catch {
                                  window.open(item.url, '_blank');
                                }
                              }}
                              className="p-2 hover:bg-[#CEA472]/20 rounded-full transition-colors shrink-0 text-[#CEA472]"
                              title="下载"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                const audio = document.getElementById(`voice-audio-${item.id}`) as HTMLAudioElement;
                                if (audio) audio.pause();
                                setVoiceHistory(prev => prev.filter(h => h.id !== item.id));
                              }}
                              className="p-2 hover:bg-red-500/20 rounded-full transition-colors shrink-0 text-red-400"
                              title="删除"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                ) : (
                  <div className="bg-black/40 border border-[#CEA472]/20 rounded-xl p-8 text-center">
                    <p className="text-[#FFFFFF]/40 text-sm">暂无任务记录</p>
                    <p className="text-[#FFFFFF]/30 text-xs mt-1">生成配音后将显示在这里</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 音效生成Tab */}
          <TabsContent value="sfx" className="space-y-6 mt-0">
            {/* 音效类型选择 */}
            <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
              <CardHeader>
                <CardTitle className="text-[#FFFFFF] flex items-center gap-2">
                  <AudioLines className="w-5 h-5 text-[#CEA472]" />
                  音效类型
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: 'ambient', label: '环境', desc: '氛围音' },
                    { value: 'fx', label: '特效', desc: '电影音效' },
                    { value: 'music', label: '音乐', desc: '背景音乐' },
                    { value: 'voice', label: '人声', desc: '说话声' },
                    { value: 'nature', label: '自然', desc: '户外声音' },
                    { value: 'tech', label: '科技', desc: '电子音效' },
                    { value: 'custom', label: '自定义', desc: '自由描述' },
                  ].map(type => (
                    <button
                      key={type.value}
                      onClick={() => setSfxType(type.value)}
                      className={`px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                        sfxType === type.value
                          ? 'bg-[#CEA472]/20 border border-[#CEA472] text-[#CEA472]'
                          : 'bg-black/40 border border-[#CEA472]/20 text-[#FFFFFF]/60 hover:border-[#CEA472]/40 hover:text-[#FFFFFF]/80'
                      }`}
                    >
                      <div className="font-medium">{type.label}</div>
                      <div className="text-xs opacity-60">{type.desc}</div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* 提示词输入区 */}
            <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
              <CardHeader>
                <CardTitle className="text-[#FFFFFF] flex items-center gap-2">
                  <Volume2 className="w-5 h-5 text-[#CEA472]" />
                  音效描述
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* 预设按钮 */}
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: '🌧️ 雨声', prompt: '雨滴打在窗户上的声音' },
                      { label: '⚡ 雷声', prompt: '远处的雷声轰鸣' },
                      { label: '🌿 鸟鸣', prompt: '森林里的鸟鸣声' },
                      { label: '🌊 海浪', prompt: '海浪拍打沙滩的声音' },
                      { label: '🔥 篝火', prompt: '篝火燃烧的噼啪声' },
                      { label: '💥 爆炸', prompt: '爆炸声' },
                      { label: '✨ 魔法', prompt: '魔法闪烁的声音' },
                      { label: '❤️ 心跳', prompt: '紧张的心跳声' },
                    ].map(preset => (
                      <button
                        key={preset.label}
                        onClick={() => {
                          setSfxPrompt(preset.prompt);
                          if (preset.label.includes('雨') || preset.label.includes('海浪') || preset.label.includes('鸟鸣')) {
                            setSfxType('nature');
                          } else if (preset.label.includes('爆炸') || preset.label.includes('魔法')) {
                            setSfxType('fx');
                          } else if (preset.label.includes('心跳')) {
                            setSfxType('fx');
                          } else if (preset.label.includes('篝火')) {
                            setSfxType('ambient');
                          }
                        }}
                        className="px-3 py-1.5 bg-black/40 border border-[#CEA472]/20 rounded-full text-sm text-[#FFFFFF]/70 hover:border-[#CEA472]/40 hover:text-[#CEA472] transition-all duration-200"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <Textarea
                    value={sfxPrompt}
                    onChange={(e) => setSfxPrompt(e.target.value)}
                    placeholder="描述你想要生成的音效，例如：雨滴打在窗户上的声音，伴随着远处的雷声"
                    className="min-h-[120px] bg-black/40 border-[#CEA472]/20 text-[#FFFFFF] placeholder:text-[#FFFFFF]/40 resize-none focus:border-[#CEA472]/60 focus:ring-[#CEA472]/20"
                  />

                  {/* 参数调节 */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[#FFFFFF]/70 text-sm">生成步数</Label>
                        <span className="text-[#CEA472] text-sm">{sfxSteps}</span>
                      </div>
                      <Slider
                        value={[sfxSteps]}
                        onValueChange={(value) => setSfxSteps(value[0])}
                        min={100}
                        max={400}
                        step={20}
                        className="w-full"
                      />
                      <p className="text-xs text-[#FFFFFF]/40">步数越高，音效越精细，但生成时间更长</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[#FFFFFF]/70 text-sm">引导系数</Label>
                        <span className="text-[#CEA472] text-sm">{sfxGuidanceScale}</span>
                      </div>
                      <Slider
                        value={[sfxGuidanceScale]}
                        onValueChange={(value) => setSfxGuidanceScale(value[0])}
                        min={1}
                        max={7}
                        step={0.5}
                        className="w-full"
                      />
                      <p className="text-xs text-[#FFFFFF]/40">系数越高，越严格遵循提示词</p>
                    </div>
                  </div>
                </div>

                {sfxError && (
                  <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                    {sfxError}
                  </div>
                )}

                <div className="mt-4">
                  <Button
                    onClick={async () => {
                      if (!sfxPrompt.trim()) {
                        setSfxError('请输入音效描述');
                        return;
                      }
                      setIsGeneratingSfx(true);
                      setSfxError('');
                      const taskId = `sfx_${Date.now()}`;

                      try {
                        const response = await fetch('/api/generate-sfx', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ 
                            prompt: sfxPrompt,
                            sfxType,
                            steps: sfxSteps,
                            guidanceScale: sfxGuidanceScale,
                          }),
                        });
                        const data = await response.json();
                        if (!response.ok || !data.success) {
                          throw new Error(data.error || '音效生成失败');
                        }
                        setSfxHistory(prev => [{
                          id: taskId,
                          prompt: sfxPrompt.substring(0, 30) + (sfxPrompt.length > 30 ? '...' : ''),
                          translatedPrompt: data.translatedPrompt || '',
                          url: data.audioUrl,
                          time: new Date().toLocaleTimeString(),
                        }, ...prev].slice(0, 10));
                      } catch (err) {
                        const errorMessage = err instanceof Error ? err.message : '音效生成失败';
                        setSfxError(errorMessage);
                      } finally {
                        setIsGeneratingSfx(false);
                      }
                    }}
                    disabled={isGeneratingSfx || !sfxPrompt.trim()}
                    className="w-full h-12 bg-[#CEA472] hover:bg-[#CEA472]/90 text-[#0a0a0f] font-semibold rounded-xl transition-all duration-300 disabled:opacity-50"
                  >
                    {isGeneratingSfx ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        生成中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 mr-2" />
                        生成音效
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 任务监控区 */}
            <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
              <CardHeader>
                <CardTitle className="text-[#FFFFFF] flex items-center gap-2">
                  <Activity className="w-5 h-5 text-[#CEA472]" />
                  任务监控
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sfxHistory.length > 0 ? (
                  <div className="space-y-2 max-h-[400px] overflow-y-scroll pr-1">
                    {sfxHistory.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 bg-black/40 border border-[#CEA472]/20 rounded-xl p-3 hover:border-[#CEA472]/40 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#FFFFFF]/80 truncate">{item.prompt}</p>
                          {item.translatedPrompt && (
                            <p className="text-xs text-[#CEA472]/70 truncate mt-0.5">{item.translatedPrompt}</p>
                          )}
                          <p className="text-xs text-[#FFFFFF]/40 mt-0.5">{item.time}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            id={`sfx-btn-${item.id}`}
                            onClick={(e) => {
                              const audio = document.getElementById(`sfx-audio-${item.id}`) as HTMLAudioElement;
                              if (audio) {
                                document.querySelectorAll('audio').forEach(a => {
                                  if (a !== audio) a.pause();
                                });
                                if (audio.paused) {
                                  audio.play();
                                  e.currentTarget.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
                                } else {
                                  audio.pause();
                                  e.currentTarget.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
                                }
                              }
                            }}
                            className="p-2 hover:bg-[#CEA472]/20 rounded-full transition-colors shrink-0 text-[#CEA472]"
                            title="预览"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                          </button>
                          <audio id={`sfx-audio-${item.id}`} src={item.url} preload="none"
                            onEnded={() => {
                              const btn = document.getElementById(`sfx-btn-${item.id}`);
                              if (btn) btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
                            }}
                          />
                          <button
                            onClick={async () => {
                              try {
                                const response = await fetch(item.url);
                                const blob = await response.blob();
                                const blobUrl = window.URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = blobUrl;
                                link.download = `音效-${item.id}.mp3`;
                                link.click();
                                window.URL.revokeObjectURL(blobUrl);
                              } catch {
                                window.open(item.url, '_blank');
                              }
                            }}
                            className="p-2 hover:bg-[#CEA472]/20 rounded-full transition-colors shrink-0 text-[#CEA472]"
                            title="下载"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              const audio = document.getElementById(`sfx-audio-${item.id}`) as HTMLAudioElement;
                              if (audio) audio.pause();
                              setSfxHistory(prev => prev.filter(h => h.id !== item.id));
                            }}
                            className="p-2 hover:bg-red-500/20 rounded-full transition-colors shrink-0 text-red-400"
                            title="删除"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-black/40 border border-[#CEA472]/20 rounded-xl p-8 text-center">
                    <p className="text-[#FFFFFF]/40 text-sm">暂无任务记录</p>
                    <p className="text-[#FFFFFF]/30 text-xs mt-1">生成音效后将显示在这里</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 字幕生成Tab */}
          <TabsContent value="subtitle" className="space-y-6 mt-0">
            {/* 文件上传区 */}
            <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
              <CardHeader>
                <CardTitle className="text-[#FFFFFF] flex items-center gap-2">
                  <FileVideo2 className="w-5 h-5 text-[#CEA472]" />
                  文件上传
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`relative aspect-video rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer ${
                    subtitleFile 
                      ? 'border-[#CEA472] bg-black/60' 
                      : 'border-[#CEA472]/30 hover:border-[#CEA472]/60 bg-black/40'
                  }`}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) handleSubtitleFileUpload(file);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => document.getElementById('subtitle-file-input')?.click()}
                >
                  {subtitleFile ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-[#FFFFFF]">
                      {subtitleFile.type.startsWith('video/') ? (
                        <FileVideo2 className="w-12 h-12 mb-3 text-[#CEA472]" />
                      ) : (
                        <AudioLines className="w-12 h-12 mb-3 text-[#CEA472]" />
                      )}
                      <p className="text-sm font-medium">{subtitleFileName}</p>
                      <p className="text-xs text-[#FFFFFF]/50 mt-1">
                        {(subtitleFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-[#FFFFFF]/50">
                      <Upload className="w-10 h-10 mb-3" />
                      <span className="text-sm font-medium">视频/音频文件</span>
                      <span className="text-xs mt-1">点击或拖拽上传</span>
                      <span className="text-xs mt-2 text-[#FFFFFF]/30">支持 MP4, MOV, MP3, WAV, M4A 等格式</span>
                    </div>
                  )}
                  <input
                    id="subtitle-file-input"
                    type="file"
                    accept="video/*,audio/*,.mp4,.mov,.avi,.mkv,.mp3,.wav,.m4a,.flac"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleSubtitleFileUpload(file);
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* 生成设置 */}
            <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
              <CardHeader className="pb-3">
                <CardTitle className="text-[#FFFFFF] flex items-center gap-2">
                  <Settings className="w-5 h-5 text-[#CEA472]" />
                  字幕设置
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 输出格式 */}
                <div className="space-y-2">
                  <Label className="text-[#FFFFFF]/80">输出格式</Label>
                  <Tabs 
                    value={subtitleFormat} 
                    onValueChange={(value) => setSubtitleFormat(value as 'srt' | 'fcpxml')} 
                    className="w-full"
                  >
                    <TabsList className="grid w-full grid-cols-2 bg-black/20 backdrop-blur-sm border border-[#CEA472]/20 rounded-lg p-1">
                      <TabsTrigger 
                        value="srt" 
                        className="data-[state=active]:text-[#CEA472] data-[state=active]:bg-black/60 data-[state=active]:shadow-sm text-[#FFFFFF]/40 hover:text-[#FFFFFF]/70 transition-all duration-300 rounded-md"
                      >
                        SRT 字幕
                      </TabsTrigger>
                      <TabsTrigger 
                        value="fcpxml" 
                        className="data-[state=active]:text-[#CEA472] data-[state=active]:bg-black/60 data-[state=active]:shadow-sm text-[#FFFFFF]/40 hover:text-[#FFFFFF]/70 transition-all duration-300 rounded-md"
                      >
                        Final Cut Pro XML
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {/* 帧率选择（仅 FCPXML 显示） */}
                {subtitleFormat === 'fcpxml' && (
                  <div className="space-y-2">
                    <Label className="text-[#FFFFFF]/80">视频帧率</Label>
                    <Select value={subtitleFrameRate} onValueChange={setSubtitleFrameRate}>
                      <SelectTrigger className="w-full bg-black/40 backdrop-blur-sm border-[#CEA472]/30 text-[#FFFFFF] focus:border-[#CEA472]/50 focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" className="bg-black/60 backdrop-blur-sm border-[#CEA472]/30 min-w-[var(--radix-select-trigger-width)]">
                        <SelectItem value="24" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">24 fps</SelectItem>
                        <SelectItem value="25" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">25 fps</SelectItem>
                        <SelectItem value="30" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">30 fps</SelectItem>
                        <SelectItem value="60" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">60 fps</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* 错误提示 */}
                {subtitleError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                    {subtitleError}
                  </div>
                )}

                {/* 生成按钮 */}
                <Button
                  onClick={handleGenerateSubtitle}
                  disabled={isGeneratingSubtitle || !subtitleFile}
                  className="w-full h-12 bg-[#CEA472] hover:bg-[#CEA472]/90 text-[#0a0a0f] font-semibold rounded-xl transition-all duration-300 disabled:opacity-50"
                >
                  {isGeneratingSubtitle ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 mr-2" />
                      生成字幕
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* 字幕预览区 */}
            {subtitleSegments.length > 0 && (
              <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
                <CardHeader className="pb-3">
                  <CardTitle className="text-[#FFFFFF] flex items-center gap-2">
                    <Subtitles className="w-5 h-5 text-[#CEA472]" />
                    字幕预览
                    <span className="text-sm font-normal text-[#FFFFFF]/50 ml-2">
                      共 {subtitleSegments.length} 条
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-black/40 border border-[#CEA472]/20 rounded-xl overflow-hidden">
                    <div className="max-h-[300px] overflow-y-scroll pr-1">
                      {subtitleSegments.map((seg) => (
                        <div
                          key={seg.id}
                          className="flex gap-3 p-3 border-b border-[#CEA472]/10 last:border-b-0 hover:bg-black/30 transition-colors"
                        >
                          <span className="text-[#CEA472] shrink-0 w-24 text-xs font-mono pt-0.5">
                            {formatTimeDisplay(seg.start)} - {formatTimeDisplay(seg.end)}
                          </span>
                          <p className="text-[#FFFFFF]/90 text-sm flex-1">{seg.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4">
                    <Button
                      onClick={() => downloadSubtitle(subtitleContent, `subtitle_${Date.now()}.${subtitleFormat}`, subtitleFormat)}
                      className="w-full h-10 bg-black/40 hover:bg-[#CEA472]/20 text-[#CEA472] border border-[#CEA472]/30 font-medium rounded-xl transition-all duration-300"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      下载 {subtitleFormat.toUpperCase()} 文件
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 任务历史 */}
            <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
              <CardHeader>
                <CardTitle className="text-[#FFFFFF] flex items-center gap-2">
                  <Activity className="w-5 h-5 text-[#CEA472]" />
                  任务历史
                </CardTitle>
              </CardHeader>
              <CardContent>
                {subtitleHistory.length > 0 ? (
                  <div className="space-y-2 max-h-[400px] overflow-y-scroll pr-1">
                    {subtitleHistory.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 bg-black/40 border border-[#CEA472]/20 rounded-xl p-3 hover:border-[#CEA472]/40 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#FFFFFF]/80 truncate">{item.fileName}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs px-1.5 py-0.5 rounded bg-[#CEA472]/10 text-[#CEA472]">
                              {item.format.toUpperCase()}
                            </span>
                            <span className="text-xs text-[#FFFFFF]/40">{item.segments} 条字幕</span>
                            <span className="text-xs text-[#FFFFFF]/40">{item.time}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => downloadSubtitle(item.content, item.downloadName, item.format)}
                            className="p-2 hover:bg-[#CEA472]/20 rounded-full transition-colors shrink-0 text-[#CEA472]"
                            title="下载"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setSubtitleHistory(prev => prev.filter(h => h.id !== item.id));
                            }}
                            className="p-2 hover:bg-red-500/20 rounded-full transition-colors shrink-0 text-red-400"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-black/40 border border-[#CEA472]/20 rounded-xl p-8 text-center">
                    <p className="text-[#FFFFFF]/40 text-sm">暂无任务记录</p>
                    <p className="text-[#FFFFFF]/30 text-xs mt-1">生成字幕后将显示在这里</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

        {/* Monitor Video Preview Modal */}
        {previewMonitorVideo && (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setPreviewMonitorVideo(null)}
          >
            <div
              className="bg-[#0a0a0f] border border-[#CEA472]/20 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-[#CEA472]/10">
                <h3 className="text-[#FFFFFF] font-medium">视频预览</h3>
                <Button
                  onClick={() => setPreviewMonitorVideo(null)}
                  variant="outline"
                  size="icon"
                  className="bg-black/40 border-[#CEA472]/30 hover:bg-[#CEA472]/20 hover:border-[#CEA472]/50"
                  title="关闭"
                >
                  <XCircle className="w-4 h-4 text-[#CEA472]" />
                </Button>
              </div>
              <div className="p-4">
                <video
                  src={previewMonitorVideo.url}
                  controls
                  autoPlay
                  className="w-full rounded-lg"
                />
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-[#FFFFFF]/60 text-sm">
                    <span className="text-[#CEA472]">{previewMonitorVideo.params.duration}秒</span>
                    <span className="mx-2">|</span>
                    <span>{previewMonitorVideo.params.resolution}</span>
                    <span className="mx-2">|</span>
                    <span>{previewMonitorVideo.params.ratio}</span>
                  </div>
                  <Button
                    onClick={async () => {
                      try {
                        const response = await fetch(`/api/download-video?url=${encodeURIComponent(previewMonitorVideo.url)}`);
                        if (!response.ok) {
                          const errorData = await response.json();
                          throw new Error(errorData.error || '下载失败');
                        }
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `视频_${Date.now()}.mp4`;
                        link.click();
                        window.URL.revokeObjectURL(url);
                      } catch (err) {
                        console.error('Download failed:', err);
                      }
                    }}
                    variant="outline"
                    size="icon"
                    className="bg-black/40 border-[#CEA472]/30 hover:bg-[#CEA472]/20 hover:border-[#CEA472]/50"
                    title="下载"
                  >
                    <Download className="w-4 h-4 text-[#CEA472]" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-[#FFFFFF]/30 text-sm">
          由 AI 视频生成模型驱动
        </div>
      </div>
    </div>
  );
}
