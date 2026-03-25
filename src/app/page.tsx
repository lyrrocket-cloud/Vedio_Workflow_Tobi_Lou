'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Loader2, Upload, Play, ArrowRight, Sparkles, Download, Image as ImageIcon, CheckCircle, AlertCircle, Clock, Zap } from 'lucide-react';

interface UploadResponse {
  success: boolean;
  url?: string;
  error?: string;
}

interface LogEntry {
  id: string;
  step: string;
  message: string;
  timestamp: string;
  progress: number;
  type: 'status' | 'complete' | 'error';
  details?: {
    elapsed?: number;
    taskId?: string;
    duration?: number;
    resolution?: string;
    ratio?: string;
    totalTime?: number;
    error?: string;
  };
}

export default function TransitionVideoGenerator() {
  const [firstFrame, setFirstFrame] = useState<File | null>(null);
  const [lastFrame, setLastFrame] = useState<File | null>(null);
  const [firstFramePreview, setFirstFramePreview] = useState<string>('');
  const [lastFramePreview, setLastFramePreview] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('场景之间平滑过渡');
  const [duration, setDuration] = useState<number>(5);
  const [resolution, setResolution] = useState<string>('720p');
  const [ratio, setRatio] = useState<string>('16:9');
  const [generateAudio, setGenerateAudio] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentProgress, setCurrentProgress] = useState<number>(0);
  const [totalTime, setTotalTime] = useState<number>(0);
  
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const lastFrameInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

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

  const addLog = (entry: Omit<LogEntry, 'id'>) => {
    const newEntry: LogEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    };
    setLogs(prev => [...prev, newEntry]);
    setCurrentProgress(entry.progress);
  };

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

  const handleGenerate = async () => {
    if (!firstFrame || !lastFrame) {
      setError('请上传首帧和尾帧图片');
      return;
    }

    setIsGenerating(true);
    setError('');
    setVideoUrl('');
    setLogs([]);
    setCurrentProgress(0);
    setTotalTime(0);

    try {
      // Upload both images
      addLog({
        step: 'upload',
        message: '正在上传首帧图片...',
        timestamp: new Date().toISOString(),
        progress: 2,
        type: 'status',
      });

      const [firstFrameUrl, lastFrameUrl] = await Promise.all([
        uploadImage(firstFrame),
        uploadImage(lastFrame).then(url => {
          addLog({
            step: 'upload',
            message: '图片上传完成',
            timestamp: new Date().toISOString(),
            progress: 8,
            type: 'status',
          });
          return url;
        }),
      ]);

      // Use SSE for video generation
      const startTime = Date.now();
      
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
        }),
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

              if (eventType === 'status') {
                addLog({
                  step: data.step as string,
                  message: data.message as string,
                  timestamp: data.timestamp as string,
                  progress: data.progress as number,
                  type: 'status',
                  details: data.elapsed ? { elapsed: data.elapsed as number } : undefined,
                });
              } else if (eventType === 'complete') {
                setVideoUrl(data.videoUrl as string);
                setTotalTime(data.totalTime as number);
                addLog({
                  step: data.step as string,
                  message: data.message as string,
                  timestamp: data.timestamp as string,
                  progress: 100,
                  type: 'complete',
                  details: {
                    taskId: data.taskId as string,
                    duration: data.duration as number,
                    resolution: data.resolution as string,
                    ratio: data.ratio as string,
                    totalTime: data.totalTime as number,
                  },
                });
              } else if (eventType === 'error') {
                setError(data.message as string);
                addLog({
                  step: data.step as string,
                  message: data.message as string,
                  timestamp: data.timestamp as string,
                  progress: (data.progress as number) || 0,
                  type: 'error',
                  details: { error: data.error as string },
                });
              }
            }
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '发生错误';
      setError(errorMessage);
      addLog({
        step: 'error',
        message: errorMessage,
        timestamp: new Date().toISOString(),
        progress: 0,
        type: 'error',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!videoUrl) return;
    
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `转场视频-${Date.now()}.mp4`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('下载视频失败');
    }
  };

  const getStepIcon = (type: string, step: string) => {
    if (type === 'complete') return <CheckCircle className="w-4 h-4 text-[#CEA472]" />;
    if (type === 'error') return <AlertCircle className="w-4 h-4 text-red-400" />;
    if (step === 'processing') return <Zap className="w-4 h-4 text-[#CEA472] animate-pulse" />;
    return <Clock className="w-4 h-4 text-[#CEA472]/60" />;
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Sparkles className="w-8 h-8 text-[#CEA472]" />
            <h1 className="text-4xl font-bold text-[#FFFFFF]">
              转场视频生成器
            </h1>
          </div>
          <p className="text-[#FFFFFF]/60 text-lg">
            上传首尾帧图片，AI智能生成流畅转场视频
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Upload & Settings */}
          <div className="space-y-6">
            {/* Image Upload Section */}
            <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
              <CardHeader>
                <CardTitle className="text-[#FFFFFF] flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-[#CEA472]" />
                  帧图片上传
                </CardTitle>
                <CardDescription className="text-[#FFFFFF]/60">
                  上传起始帧和结束帧图片
                </CardDescription>
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
                        <span className="text-xs mt-1">点击或拖拽上传</span>
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
                        <span className="text-sm font-medium">尾帧图片</span>
                        <span className="text-xs mt-1">点击或拖拽上传</span>
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
              </CardContent>
            </Card>

            {/* Settings Section */}
            <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
              <CardHeader>
                <CardTitle className="text-[#FFFFFF]">生成设置</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Prompt */}
                <div className="space-y-2">
                  <Label className="text-[#FFFFFF]/80">转场描述</Label>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="描述转场效果..."
                    className="bg-black/40 backdrop-blur-sm border-[#CEA472]/30 text-[#FFFFFF] placeholder:text-[#FFFFFF]/50 focus:border-[#CEA472]/50 focus:ring-0 resize-none"
                    rows={3}
                  />
                </div>

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
                      <SelectTrigger className="bg-black/40 backdrop-blur-sm border-[#CEA472]/30 text-[#FFFFFF] focus:border-[#CEA472]/50 focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-black/60 backdrop-blur-sm border-[#CEA472]/30">
                        <SelectItem value="480p" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">480p</SelectItem>
                        <SelectItem value="720p" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">720p</SelectItem>
                        <SelectItem value="1080p" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">1080p</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[#FFFFFF]/80">宽高比</Label>
                    <Select value={ratio} onValueChange={setRatio}>
                      <SelectTrigger className="bg-black/40 backdrop-blur-sm border-[#CEA472]/30 text-[#FFFFFF] focus:border-[#CEA472]/50 focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-black/60 backdrop-blur-sm border-[#CEA472]/30">
                        <SelectItem value="16:9" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">16:9</SelectItem>
                        <SelectItem value="9:16" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">9:16</SelectItem>
                        <SelectItem value="1:1" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">1:1</SelectItem>
                        <SelectItem value="4:3" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">4:3</SelectItem>
                        <SelectItem value="3:4" className="text-[#FFFFFF] hover:bg-black/40 focus:bg-black/40 data-[highlighted]:text-[#CEA472]">3:4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Audio Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-[#FFFFFF]/80">生成音频</Label>
                    <p className="text-xs text-[#FFFFFF]/50 mt-1">AI自动生成音效和背景音乐</p>
                  </div>
                  <Switch
                    checked={generateAudio}
                    onCheckedChange={setGenerateAudio}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !firstFrame || !lastFrame}
              className="w-full h-14 bg-[#CEA472] hover:bg-[#CEA472]/80 text-[#0a0a0f] border border-[#CEA472]/20 shadow-lg font-semibold text-lg rounded-xl transition-all duration-300 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  正在生成视频...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 mr-2" />
                  生成转场视频
                </>
              )}
            </Button>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Right Column - Status Logs & Video Preview */}
          <div className="space-y-6">
            {/* Status Logs */}
            {(logs.length > 0 || isGenerating) && (
              <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-[#FFFFFF] text-base flex items-center gap-2">
                      <Zap className={`w-4 h-4 text-[#CEA472] ${isGenerating ? 'animate-pulse' : ''}`} />
                      运行状态
                    </CardTitle>
                    {totalTime > 0 && (
                      <span className="text-[#CEA472] text-sm font-medium">
                        总耗时: {totalTime}秒
                      </span>
                    )}
                  </div>
                  {/* Progress Bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[#FFFFFF]/60 text-xs">进度</span>
                      <span className="text-[#CEA472] text-xs font-medium">{currentProgress}%</span>
                    </div>
                    <Progress 
                      value={currentProgress} 
                      className="h-2 bg-black/60 [&>div]:bg-[#CEA472]"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Log Entries */}
                  <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-[#CEA472]/20 scrollbar-track-transparent">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className={`flex items-start gap-2 p-2 rounded-lg ${
                          log.type === 'error' 
                            ? 'bg-red-500/10 border border-red-500/20' 
                            : log.type === 'complete'
                            ? 'bg-[#CEA472]/10 border border-[#CEA472]/20'
                            : 'bg-black/40'
                        }`}
                      >
                        {getStepIcon(log.type, log.step)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-sm ${
                              log.type === 'error' 
                                ? 'text-red-400' 
                                : log.type === 'complete'
                                ? 'text-[#CEA472]'
                                : 'text-[#FFFFFF]/80'
                            }`}>
                              {log.message}
                            </span>
                            <span className="text-[#FFFFFF]/40 text-xs shrink-0">
                              {formatTime(log.timestamp)}
                            </span>
                          </div>
                          {log.details && (
                            <div className="mt-1 text-xs text-[#FFFFFF]/40">
                              {log.details.elapsed && <span>已用时: {log.details.elapsed}秒</span>}
                              {log.details.taskId && (
                                <span className="block">任务ID: {String(log.details.taskId).slice(0, 20)}...</span>
                              )}
                              {log.details.duration && (
                                <span className="block">视频时长: {log.details.duration}秒 | 分辨率: {log.details.resolution} | 比例: {log.details.ratio}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Video Preview */}
            <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500 h-full">
              <CardHeader>
                <CardTitle className="text-[#FFFFFF] flex items-center justify-between">
                  <span>生成结果</span>
                  {videoUrl && (
                    <Button
                      onClick={handleDownload}
                      variant="outline"
                      size="sm"
                      className="bg-black/60 hover:bg-[#CEA472]/10 border border-[#CEA472]/60 text-[#FFFFFF] hover:text-[#CEA472] hover:border-[#CEA472] transition-all duration-300"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      下载视频
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {videoUrl ? (
                  <div className="aspect-video rounded-xl overflow-hidden bg-black border border-[#CEA472]/20">
                    <video
                      src={videoUrl}
                      controls
                      autoPlay
                      loop
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="aspect-video rounded-xl border-2 border-dashed border-[#CEA472]/20 bg-black/40 flex items-center justify-center">
                    <div className="text-center text-[#FFFFFF]/50">
                      <Play className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">暂无生成视频</p>
                      <p className="text-sm mt-2">上传首尾帧后点击生成</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-[#FFFFFF]/30 text-sm">
          由 AI 视频生成模型驱动
        </div>
      </div>
    </div>
  );
}
