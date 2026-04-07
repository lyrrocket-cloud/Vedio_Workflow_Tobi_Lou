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
import { Loader2, Upload, Play, ArrowRight, Sparkles, Download, Image as ImageIcon, CheckCircle, AlertCircle, Clock, Zap, Info, History, Trash2, Eye, XCircle, Monitor, RefreshCw, StopCircle, Video } from 'lucide-react';

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
  note?: string;
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

interface HistoryItem {
  id: string;
  videoUrl: string;
  firstFrameUrl: string;
  lastFrameUrl: string;
  prompt: string;
  duration: number;
  resolution: string;
  ratio: string;
  generateAudio: boolean;
  createdAt: string;
  totalTime: number;
}

const HISTORY_STORAGE_KEY = 'video-generation-history';
const MAX_HISTORY_ITEMS = 20;

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

interface TechnicalLog {
  id: string;
  timestamp: string;
  type: 'request' | 'response' | 'event' | 'error' | 'info';
  category: string;
  message: string;
  details?: Record<string, unknown>;
  elapsed?: number;
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
  const [generateAudio, setGenerateAudio] = useState<boolean>(true);
  const [mockMode, setMockMode] = useState<boolean>(false);
  const [asyncMode, setAsyncMode] = useState<boolean>(true); // 默认使用异步模式
  const [removeWatermark, setRemoveWatermark] = useState<boolean>(true); // 默认开启去水印
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentProgress, setCurrentProgress] = useState<number>(0);
  const [totalTime, setTotalTime] = useState<number>(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [previewHistoryItem, setPreviewHistoryItem] = useState<HistoryItem | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [canCancel, setCanCancel] = useState<boolean>(false);
  const [currentTaskId, setCurrentTaskId] = useState<string>('');
  
  // Technical logs for debugging
  const [technicalLogs, setTechnicalLogs] = useState<TechnicalLog[]>([]);
  const [showTechnicalLogs, setShowTechnicalLogs] = useState<boolean>(false);
  
  // Monitor state - 常驻底部显示
  const [monitorTasks, setMonitorTasks] = useState<MonitorTask[]>([]);
  const [monitorStats, setMonitorStats] = useState<MonitorStats>({ total: 0, queued: 0, running: 0, succeeded: 0, failed: 0 });
  const [monitorLoading, setMonitorLoading] = useState<boolean>(false);
  const [monitorCollapsed, setMonitorCollapsed] = useState<boolean>(false); // 折叠状态
  const monitorPollRef = useRef<NodeJS.Timeout | null>(null);
  
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const lastFrameInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const elapsedTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load history from localStorage
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (savedHistory) {
        setHistory(JSON.parse(savedHistory));
      }
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  }, []);

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

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const saveToHistory = useCallback((item: Omit<HistoryItem, 'id' | 'createdAt'>) => {
    const newItem: HistoryItem = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      createdAt: new Date().toISOString(),
    };
    
    setHistory(prev => {
      const updated = [newItem, ...prev].slice(0, MAX_HISTORY_ITEMS);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save history:', e);
      }
      return updated;
    });
  }, []);

  const deleteHistoryItem = useCallback((id: string) => {
    setHistory(prev => {
      const updated = prev.filter(item => item.id !== id);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to update history:', e);
      }
      return updated;
    });
    if (previewHistoryItem?.id === id) {
      setPreviewHistoryItem(null);
    }
  }, [previewHistoryItem]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setPreviewHistoryItem(null);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear history:', e);
    }
  }, []);

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

  // Technical log for debugging
  const generationStartTimeRef = useRef<number>(0);
  
  const addTechnicalLog = (
    type: TechnicalLog['type'],
    category: string,
    message: string,
    details?: Record<string, unknown>
  ) => {
    const elapsed = generationStartTimeRef.current > 0 
      ? Math.round((Date.now() - generationStartTimeRef.current) / 1000)
      : undefined;
    
    const newLog: TechnicalLog = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      timestamp: new Date().toISOString(),
      type,
      category,
      message,
      details,
      elapsed,
    };
    
    setTechnicalLogs(prev => [...prev, newLog]);
    console.log(`[${category}] ${message}`, details || '');
  };

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
  const handleGenerateAsync = async (firstFrameUrl: string, lastFrameUrl: string) => {
    addTechnicalLog('request', '异步提交', '提交视频生成任务', {
      endpoint: '/api/generate-video-async',
      asyncMode: true,
    });
    
    const submitStartTime = Date.now();
    
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
    setCurrentTaskId(taskId);
    
    addTechnicalLog('response', '异步提交', '任务已提交', {
      taskId,
      status: submitData.status,
      耗时: `${Date.now() - submitStartTime}ms`,
    });
    
    addLog({
      step: 'submitted',
      message: `✅ 任务已提交 (ID: ${taskId.slice(0, 12)}...)`,
      timestamp: new Date().toISOString(),
      progress: 10,
      type: 'status',
      note: '使用异步模式，可关闭页面后继续处理',
    });
    
    // 连接SSE监听状态
    addTechnicalLog('request', 'SSE监听', '开始监听任务状态', { taskId });
    
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
            
            addTechnicalLog('event', 'SSE事件', eventType, data);
            
            if (eventType === 'status') {
              const progressMap: Record<string, number> = {
                'queued': 15,
                'running': 50,
              };
              addLog({
                step: data.status,
                message: data.message,
                timestamp: new Date().toISOString(),
                progress: progressMap[data.status] || currentProgress,
                type: 'status',
                details: { elapsed: data.elapsed },
              });
            } else if (eventType === 'complete') {
              const newVideoUrl = data.videoUrl;
              setVideoUrl(newVideoUrl);
              setTotalTime(data.elapsed);
              addLog({
                step: 'complete',
                message: data.message,
                timestamp: new Date().toISOString(),
                progress: 100,
                type: 'complete',
                details: { taskId, totalTime: data.elapsed },
              });
              addTechnicalLog('info', '完成', '视频生成成功', {
                videoUrl: newVideoUrl,
                totalTime: data.elapsed,
              });
              saveToHistory({
                videoUrl: newVideoUrl,
                firstFrameUrl: firstFramePreview,
                lastFrameUrl: lastFramePreview,
                prompt,
                duration,
                resolution,
                ratio,
                generateAudio,
                totalTime: data.elapsed,
              });
            } else if (eventType === 'error') {
              setError(data.error || data.message);
              addLog({
                step: 'error',
                message: data.message,
                timestamp: new Date().toISOString(),
                progress: 0,
                type: 'error',
                details: { error: data.error },
              });
            } else if (eventType === 'heartbeat') {
              // 心跳事件，更新进度显示
              setCurrentProgress(Math.min(85, 20 + Math.floor(data.elapsed / 10)));
            }
          }
        }
      }
    }
  };

  const handleGenerate = async () => {
    if (!firstFrame || !lastFrame) {
      setError('请上传首帧和尾帧图片');
      return;
    }

    // Reset technical logs
    generationStartTimeRef.current = Date.now();
    setTechnicalLogs([]);
    
    addTechnicalLog('info', '初始化', '开始生成视频', {
      文件信息: {
        首帧: { name: firstFrame.name, size: `${(firstFrame.size / 1024).toFixed(2)}KB`, type: firstFrame.type },
        尾帧: { name: lastFrame.name, size: `${(lastFrame.size / 1024).toFixed(2)}KB`, type: lastFrame.type },
      },
      参数设置: { duration, resolution, ratio, generateAudio, mockMode },
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
    });

    setIsGenerating(true);
    setError('');
    setVideoUrl('');
    setLogs([]);
    setCurrentProgress(0);
    setTotalTime(0);
    setElapsedSeconds(0);
    setCanCancel(true);

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();
    
    // Start elapsed timer
    const startTime = Date.now();
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      // Upload both images
      addLog({
        step: 'upload',
        message: '正在上传首帧图片...',
        timestamp: new Date().toISOString(),
        progress: 2,
        type: 'status',
      });
      
      addTechnicalLog('request', '上传', '开始上传图片到对象存储');

      const uploadStartTime = Date.now();
      const [firstFrameUrl, lastFrameUrl] = await Promise.all([
        uploadImage(firstFrame).then(url => {
          addTechnicalLog('response', '上传', '首帧图片上传完成', {
            url: url.substring(0, 100) + '...',
            耗时: `${Math.round((Date.now() - uploadStartTime) / 1000)}秒`,
          });
          return url;
        }),
        uploadImage(lastFrame).then(url => {
          addTechnicalLog('response', '上传', '尾帧图片上传完成', {
            url: url.substring(0, 100) + '...',
          });
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
      
      addTechnicalLog('info', '上传', '所有图片上传完成', {
        总耗时: `${Math.round((Date.now() - uploadStartTime) / 1000)}秒`,
      });

      // 根据模式选择生成方式
      if (asyncMode) {
        // 异步模式：提交任务后立即返回，通过SSE监听状态
        addLog({
          step: 'mode',
          message: '🚀 使用异步模式 - 任务提交后可关闭页面',
          timestamp: new Date().toISOString(),
          progress: 9,
          type: 'status',
        });
        await handleGenerateAsync(firstFrameUrl, lastFrameUrl);
      } else {
        // 同步模式：使用SSE阻塞等待
        addLog({
          step: 'mode',
          message: '⏳ 使用同步模式 - 等待生成完成',
          timestamp: new Date().toISOString(),
          progress: 9,
          type: 'status',
        });
        await handleGenerateSync(firstFrameUrl, lastFrameUrl);
      }
    } catch (err) {
      // Handle abort error
      if (err instanceof Error && err.name === 'AbortError') {
        addTechnicalLog('info', '取消', '用户取消视频生成');
        addLog({
          step: 'cancelled',
          message: '用户取消了视频生成',
          timestamp: new Date().toISOString(),
          progress: currentProgress,
          type: 'error',
        });
      } else {
        const errorMessage = err instanceof Error ? err.message : '发生错误';
        addTechnicalLog('error', '异常', errorMessage, {
          错误堆栈: err instanceof Error ? err.stack : undefined,
        });
        setError(errorMessage);
        addLog({
          step: 'error',
          message: errorMessage,
          timestamp: new Date().toISOString(),
          progress: 0,
          type: 'error',
        });
      }
    } finally {
      setIsGenerating(false);
      setCanCancel(false);
      // Clear elapsed timer
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
      abortControllerRef.current = null;
    }
  };

  // 同步模式生成视频
  const handleGenerateSync = async (firstFrameUrl: string, lastFrameUrl: string) => {
    addTechnicalLog('request', '视频生成', '发起SSE视频生成请求', {
      endpoint: '/api/generate-video-sse',
      body: {
        duration,
        resolution,
        ratio,
        generateAudio,
        mockMode,
        firstFrameUrl: firstFrameUrl.substring(0, 100) + '...',
        lastFrameUrl: lastFrameUrl.substring(0, 100) + '...',
      },
    });
    
    const sseStartTime = Date.now();
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
    
    addTechnicalLog('response', '视频生成', 'SSE连接建立', {
      status: response.status,
      statusText: response.statusText,
      连接耗时: `${Math.round((Date.now() - sseStartTime) / 1000)}秒`,
    });

    if (!response.ok) {
      const errorText = await response.text();
      addTechnicalLog('error', '视频生成', 'SSE请求失败', {
        status: response.status,
        statusText: response.statusText,
        body: errorText.substring(0, 500),
      });
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }
    
    addTechnicalLog('info', '视频生成', '开始读取SSE流');

    const decoder = new TextDecoder();
    let buffer = '';
    let eventCount = 0;

    while (true) {
      const readStartTime = Date.now();
      const { done, value } = await reader.read();
      
      if (done) {
        addTechnicalLog('info', '视频生成', 'SSE流读取完成', {
          总事件数: eventCount,
          总耗时: `${Math.round((Date.now() - sseStartTime) / 1000)}秒`,
        });
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventCount++;
          const eventMatch = line.match(/^event: (\w+)\ndata: ([\s\S]+)$/);
          if (eventMatch) {
            const eventType = eventMatch[1];
            const rawData = eventMatch[2];
            let data;
            try {
              data = JSON.parse(rawData);
            } catch (e) {
              addTechnicalLog('error', 'SSE解析', 'JSON解析失败', {
                rawData: rawData.substring(0, 200),
              });
              continue;
            }

            addTechnicalLog('event', 'SSE事件', `${eventType}`, {
              事件序号: eventCount,
              时间戳: data.timestamp,
              进度: data.progress,
              步骤: data.step,
              消息: data.message,
              读取耗时: `${Date.now() - readStartTime}ms`,
            });

            if (eventType === 'status') {
              addLog({
                step: data.step as string,
                message: data.message as string,
                timestamp: data.timestamp as string,
                progress: data.progress as number,
                type: 'status',
                note: data.note as string | undefined,
                details: data.elapsed ? { elapsed: data.elapsed as number } : undefined,
              });
            } else if (eventType === 'complete') {
              const newVideoUrl = data.videoUrl as string;
              const newTotalTime = data.totalTime as number;
              setVideoUrl(newVideoUrl);
              setTotalTime(newTotalTime);
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
                  totalTime: newTotalTime,
                },
              });
              
              addTechnicalLog('info', '完成', '视频生成成功', {
                视频URL: newVideoUrl.substring(0, 100) + '...',
                总耗时: `${newTotalTime}秒`,
                taskId: data.taskId,
              });
              
              saveToHistory({
                videoUrl: newVideoUrl,
                firstFrameUrl: firstFramePreview,
                lastFrameUrl: lastFramePreview,
                prompt,
                duration: duration,
                resolution: resolution,
                ratio: ratio,
                generateAudio: generateAudio,
                totalTime: newTotalTime,
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
              
              addTechnicalLog('error', '错误', data.message, {
                错误详情: data.error,
                完整数据: data,
              });
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
    <div className="min-h-screen bg-[#0a0a0f] bg-cover bg-center bg-fixed bg-no-repeat relative" style={{ backgroundImage: 'url(https://code.coze.cn/api/sandbox/coze_coding/file/proxy?expire_time=-1&file_path=assets%2F20260226-113651.jpg&nonce=a15fb89a-7b6f-42f5-96a2-cabae4250535&project_id=7621104939930222628&sign=c5833d8e5d38ee15db957f67079aaae1ebebd3d2a5afee749e7fa9a00398639c)' }}>
      {/* 背景遮罩层 */}
      <div className="absolute inset-0 bg-[#0a0a0f]/80" />
      
      <div className="container mx-auto px-4 py-8 max-w-6xl relative z-10">
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
              视频生成器
            </h1>
          </div>
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

                {/* Remove Watermark Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                  <div>
                    <Label className="text-blue-400/80 flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      去水印
                    </Label>
                    <p className="text-xs text-[#FFFFFF]/50 mt-1">
                      {removeWatermark 
                        ? '已开启：生成视频不包含水印' 
                        : '已关闭：生成视频可能包含水印'}
                    </p>
                  </div>
                  <Switch
                    checked={removeWatermark}
                    onCheckedChange={setRemoveWatermark}
                  />
                </div>

                {/* Async Mode Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                  <div>
                    <Label className="text-green-400/80 flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      异步模式
                    </Label>
                    <p className="text-xs text-[#FFFFFF]/50 mt-1">
                      {asyncMode 
                        ? '任务提交后可关闭页面，后台继续处理' 
                        : '同步等待生成完成，实时显示进度'}
                    </p>
                  </div>
                  <Switch
                    checked={asyncMode}
                    onCheckedChange={setAsyncMode}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Generate Button */}
            <div className="space-y-3">
              <div className="flex gap-3">
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !firstFrame || !lastFrame}
                  className="flex-1 h-14 bg-[#CEA472] hover:bg-[#CEA472]/80 text-[#0a0a0f] border border-[#CEA472]/20 shadow-lg font-semibold text-lg rounded-xl transition-all duration-300 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      正在生成...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 mr-2" />
                      生成转场视频
                    </>
                  )}
                </Button>
                {canCancel && (
                  <Button
                    onClick={handleCancel}
                    variant="outline"
                    className="h-14 px-4 bg-black/60 hover:bg-red-500/10 border border-[#CEA472]/60 text-[#FFFFFF] hover:text-red-400 hover:border-red-500/50 transition-all duration-300"
                  >
                    <XCircle className="w-5 h-5" />
                  </Button>
                )}
              </div>
            </div>

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
                          {log.note && (
                            <div className="mt-1.5 p-1.5 bg-[#CEA472]/5 rounded text-xs text-[#CEA472]/80">
                              {log.note}
                            </div>
                          )}
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
            <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
              <CardHeader className="pb-3">
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
                      <Play className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="text-base font-medium">暂无生成视频</p>
                      <p className="text-sm mt-1">上传首尾帧后点击生成</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* History Section */}
        {history.length > 0 && (
          <div className="mt-8">
            <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-[#FFFFFF] flex items-center gap-2">
                    <History className="w-5 h-5 text-[#CEA472]" />
                    历史记录
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => setShowHistory(!showHistory)}
                      variant="outline"
                      size="sm"
                      className="bg-black/60 hover:bg-[#CEA472]/10 border border-[#CEA472]/60 text-[#FFFFFF] hover:text-[#CEA472] hover:border-[#CEA472] transition-all duration-300"
                    >
                      {showHistory ? '收起' : '展开'} ({history.length})
                    </Button>
                    {showHistory && (
                      <Button
                        onClick={clearHistory}
                        variant="outline"
                        size="sm"
                        className="bg-black/60 hover:bg-red-500/10 border border-red-500/40 text-red-400 hover:text-red-300 hover:border-red-500 transition-all duration-300"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        清空
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              {showHistory && (
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        className="group relative bg-black/60 rounded-xl border border-[#CEA472]/20 overflow-hidden hover:border-[#CEA472]/50 transition-all duration-300"
                      >
                        {/* Thumbnail */}
                        <div className="aspect-video relative bg-black">
                          <video
                            src={item.videoUrl}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                            onMouseEnter={(e) => e.currentTarget.play()}
                            onMouseLeave={(e) => {
                              e.currentTarget.pause();
                              e.currentTarget.currentTime = 0;
                            }}
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2">
                            <Button
                              onClick={() => setPreviewHistoryItem(item)}
                              size="sm"
                              className="bg-[#CEA472] hover:bg-[#CEA472]/80 text-[#0a0a0f]"
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              查看
                            </Button>
                            <Button
                              onClick={async () => {
                                try {
                                  const response = await fetch(`/api/download-video?url=${encodeURIComponent(item.videoUrl)}`);
                                  if (!response.ok) {
                                    const errorData = await response.json();
                                    throw new Error(errorData.error || '下载失败');
                                  }
                                  const blob = await response.blob();
                                  const url = window.URL.createObjectURL(blob);
                                  const link = document.createElement('a');
                                  link.href = url;
                                  link.download = `视频_${new Date(item.createdAt).getTime()}.mp4`;
                                  link.click();
                                  window.URL.revokeObjectURL(url);
                                } catch (err) {
                                  console.error('Download failed:', err);
                                }
                              }}
                              size="sm"
                              className="bg-black/60 hover:bg-[#CEA472]/10 border border-[#CEA472]/60 text-[#FFFFFF] hover:text-[#CEA472]"
                            >
                              <Download className="w-4 h-4 mr-1" />
                              下载
                            </Button>
                          </div>
                        </div>
                        {/* Info */}
                        <div className="p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[#CEA472] text-sm font-medium">
                              {item.duration}秒 | {item.resolution}
                            </span>
                            <Button
                              onClick={() => deleteHistoryItem(item.id)}
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-[#FFFFFF]/40 hover:text-red-400 hover:bg-transparent"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                          <p className="text-[#FFFFFF]/60 text-xs truncate">
                            {item.prompt}
                          </p>
                          <p className="text-[#FFFFFF]/40 text-xs mt-1">
                            {new Date(item.createdAt).toLocaleString('zh-CN', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        )}

        {/* Technical Logs Section - Debug Panel */}
        {technicalLogs.length > 0 && (
          <div className="mt-8">
            <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-[#FFFFFF] flex items-center gap-2 text-base">
                    <Info className="w-5 h-5 text-[#CEA472]" />
                    技术日志
                    <span className="text-xs text-[#CEA472]/60 font-normal ml-2">
                      (调试面板 - 排查性能问题)
                    </span>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => {
                        const logText = technicalLogs.map(log => 
                          `[${log.timestamp}] [${log.elapsed ?? 0}s] [${log.type.toUpperCase()}] [${log.category}] ${log.message}\n${log.details ? JSON.stringify(log.details, null, 2) : ''}`
                        ).join('\n\n');
                        navigator.clipboard.writeText(logText);
                      }}
                      variant="outline"
                      size="sm"
                      className="bg-black/60 hover:bg-[#CEA472]/10 border border-[#CEA472]/60 text-[#FFFFFF] hover:text-[#CEA472] hover:border-[#CEA472] transition-all duration-300"
                    >
                      复制日志
                    </Button>
                    <Button
                      onClick={() => setShowTechnicalLogs(!showTechnicalLogs)}
                      variant="outline"
                      size="sm"
                      className="bg-black/60 hover:bg-[#CEA472]/10 border border-[#CEA472]/60 text-[#FFFFFF] hover:text-[#CEA472] hover:border-[#CEA472] transition-all duration-300"
                    >
                      {showTechnicalLogs ? '收起' : '展开'} ({technicalLogs.length})
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {showTechnicalLogs && (
                <CardContent>
                  <div className="max-h-[500px] overflow-y-auto space-y-1 pr-2 scrollbar-thin scrollbar-thumb-[#CEA472]/20 scrollbar-track-transparent font-mono text-xs">
                    {technicalLogs.map((log) => (
                      <div
                        key={log.id}
                        className={`p-3 rounded-lg border ${
                          log.type === 'error' 
                            ? 'bg-red-500/5 border-red-500/20' 
                            : log.type === 'event'
                            ? 'bg-[#CEA472]/5 border-[#CEA472]/10'
                            : log.type === 'request'
                            ? 'bg-blue-500/5 border-blue-500/20'
                            : log.type === 'response'
                            ? 'bg-green-500/5 border-green-500/20'
                            : 'bg-black/40 border-[#CEA472]/10'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            log.type === 'error' 
                              ? 'bg-red-500/20 text-red-400' 
                              : log.type === 'event'
                              ? 'bg-[#CEA472]/20 text-[#CEA472]'
                              : log.type === 'request'
                              ? 'bg-blue-500/20 text-blue-400'
                              : log.type === 'response'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-[#CEA472]/10 text-[#CEA472]/60'
                          }`}>
                            {log.type.toUpperCase()}
                          </span>
                          <span className="text-[#CEA472] font-medium">
                            [{log.category}]
                          </span>
                          <span className="text-[#FFFFFF]/80">
                            {log.message}
                          </span>
                          <span className="ml-auto text-[#FFFFFF]/40 shrink-0">
                            {new Date(log.timestamp).toLocaleTimeString('zh-CN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              fractionalSecondDigits: 3,
                            })}
                          </span>
                          {log.elapsed !== undefined && (
                            <span className="text-[#CEA472]/60 shrink-0">
                              +{log.elapsed}s
                            </span>
                          )}
                        </div>
                        {log.details && (
                          <pre className="mt-2 p-2 bg-black/60 rounded text-[#FFFFFF]/60 overflow-x-auto whitespace-pre-wrap break-all">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        )}

        {/* Preview Modal */}
        {previewHistoryItem && (
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setPreviewHistoryItem(null)}
          >
            <div 
              className="bg-[#0a0a0f] border border-[#CEA472]/20 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-[#CEA472]/10">
                <h3 className="text-[#FFFFFF] font-medium">视频预览</h3>
                <Button
                  onClick={() => setPreviewHistoryItem(null)}
                  variant="ghost"
                  size="sm"
                  className="text-[#FFFFFF]/60 hover:text-[#FFFFFF]"
                >
                  关闭
                </Button>
              </div>
              <div className="p-4">
                <video
                  src={previewHistoryItem.videoUrl}
                  controls
                  autoPlay
                  className="w-full rounded-lg"
                />
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-[#FFFFFF]/60 text-sm">
                    <span className="text-[#CEA472]">{previewHistoryItem.duration}秒</span>
                    <span className="mx-2">|</span>
                    <span>{previewHistoryItem.resolution}</span>
                    <span className="mx-2">|</span>
                    <span>{previewHistoryItem.ratio}</span>
                    <span className="mx-2">|</span>
                    <span>{previewHistoryItem.generateAudio ? '有音频' : '无音频'}</span>
                  </div>
                  <Button
                    onClick={async () => {
                      try {
                        const response = await fetch(`/api/download-video?url=${encodeURIComponent(previewHistoryItem.videoUrl)}`);
                        if (!response.ok) {
                          const errorData = await response.json();
                          throw new Error(errorData.error || '下载失败');
                        }
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `视频_${new Date(previewHistoryItem.createdAt).getTime()}.mp4`;
                        link.click();
                        window.URL.revokeObjectURL(url);
                      } catch (err) {
                        console.error('Download failed:', err);
                      }
                    }}
                    className="bg-[#CEA472] hover:bg-[#CEA472]/80 text-[#0a0a0f]"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    下载视频
                  </Button>
                </div>
                <p className="mt-3 text-[#FFFFFF]/50 text-sm">
                  {previewHistoryItem.prompt}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Task Monitor - 常驻底部显示 */}
        {asyncMode && (
          <div className="mt-8">
            <Card className="border-[#CEA472]/10 bg-black/40 backdrop-blur-sm hover:border-[#CEA472]/30 transition-all duration-500">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-[#FFFFFF] flex items-center gap-2">
                      <Monitor className="w-5 h-5 text-[#CEA472]" />
                      异步任务监控
                    </CardTitle>
                    {/* 统计信息 */}
                    <div className="flex items-center gap-2 text-sm">
                      <span className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                        排队: {monitorStats.queued}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                        运行: {monitorStats.running}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                        成功: {monitorStats.succeeded}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400">
                        失败: {monitorStats.failed}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => {
                        setMonitorLoading(true);
                        fetchMonitorTasks().finally(() => setMonitorLoading(false));
                      }}
                      variant="ghost"
                      size="sm"
                      className="text-[#CEA472] hover:text-[#CEA472] hover:bg-[#CEA472]/10"
                    >
                      <RefreshCw className={`w-4 h-4 ${monitorLoading ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button
                      onClick={() => setMonitorCollapsed(!monitorCollapsed)}
                      variant="ghost"
                      size="sm"
                      className="text-[#FFFFFF]/60 hover:text-[#FFFFFF]"
                    >
                      {monitorCollapsed ? '展开' : '收起'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              {!monitorCollapsed && (
                <CardContent>
                  {monitorLoading && monitorTasks.length === 0 ? (
                    <div className="text-center py-8 text-[#FFFFFF]/50">
                      <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                      <p className="text-sm">加载任务列表...</p>
                    </div>
                  ) : monitorTasks.length === 0 ? (
                    <div className="text-center py-8 text-[#FFFFFF]/50">
                      <Monitor className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">暂无异步任务</p>
                      <p className="text-xs mt-1">开启异步模式后生成的任务会显示在这里</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {monitorTasks.map((task) => (
                        <div
                          key={task.id}
                          className={`p-3 rounded-lg border ${
                            task.status === 'running' 
                              ? 'bg-blue-500/5 border-blue-500/20' 
                              : task.status === 'succeeded'
                              ? 'bg-green-500/5 border-green-500/20'
                              : task.status === 'failed'
                              ? 'bg-red-500/5 border-red-500/20'
                              : task.status === 'cancelled'
                              ? 'bg-gray-500/5 border-gray-500/20'
                              : 'bg-yellow-500/5 border-yellow-500/20'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {/* 状态图标 */}
                              {task.status === 'running' && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
                              {task.status === 'queued' && <Clock className="w-4 h-4 text-yellow-400" />}
                              {task.status === 'succeeded' && <CheckCircle className="w-4 h-4 text-green-400" />}
                              {task.status === 'failed' && <XCircle className="w-4 h-4 text-red-400" />}
                              {task.status === 'cancelled' && <StopCircle className="w-4 h-4 text-gray-400" />}
                              
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[#FFFFFF]/80 font-mono text-xs">
                                    {task.id.slice(0, 12)}...
                                  </span>
                                  <span className={`text-xs px-2 py-0.5 rounded ${
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
                                </div>
                                <div className="text-[#FFFFFF]/50 text-xs mt-1">
                                  {task.params.duration}秒 | {task.params.resolution} | {task.params.ratio}
                                  <span className="mx-2">•</span>
                                  {task.elapsed}秒前
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {/* 查看视频按钮 */}
                              {task.status === 'succeeded' && task.videoUrl && (
                                <Button
                                  onClick={() => setVideoUrl(task.videoUrl!)}
                                  size="sm"
                                  className="bg-[#CEA472] hover:bg-[#CEA472]/80 text-[#0a0a0f] h-7"
                                >
                                  <Eye className="w-3 h-3 mr-1" />
                                  查看
                                </Button>
                              )}
                              
                              {/* 取消按钮 */}
                              {(task.status === 'queued' || task.status === 'running') && (
                                <Button
                                  onClick={() => cancelTask(task.id)}
                                  variant="outline"
                                  size="sm"
                                  className="bg-black/60 hover:bg-red-500/10 border border-red-500/40 text-red-400 hover:text-red-300 h-7"
                                >
                                  <StopCircle className="w-3 h-3 mr-1" />
                                  取消
                                </Button>
                              )}
                              
                              {/* 下载按钮 */}
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
                                  variant="outline"
                                  size="sm"
                                  className="bg-black/60 hover:bg-[#CEA472]/10 border border-[#CEA472]/60 text-[#CEA472] h-7"
                                >
                                  <Download className="w-3 h-3 mr-1" />
                                  下载
                                </Button>
                              )}
                            </div>
                          </div>
                          
                          {/* 错误信息 */}
                          {task.status === 'failed' && task.error && (
                            <div className="mt-2 text-xs text-red-400/80 bg-red-500/5 p-2 rounded">
                              {task.error}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
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
