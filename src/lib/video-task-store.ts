/**
 * 视频生成任务状态存储
 * 使用内存Map存储，适用于单实例部署
 */

import { TaskStatus } from 'coze-coding-dev-sdk';

export interface VideoTask {
  id: string;
  status: TaskStatus;
  videoUrl?: string;
  lastFrameUrl?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  // 请求参数
  params: {
    firstFrameUrl: string;
    lastFrameUrl: string;
    prompt: string;
    duration: number;
    resolution: string;
    ratio: string;
    generateAudio: boolean;
  };
}

// 内存存储
const taskStore = new Map<string, VideoTask>();

export function getTask(taskId: string): VideoTask | undefined {
  return taskStore.get(taskId);
}

export function setTask(taskId: string, task: VideoTask): void {
  taskStore.set(taskId, task);
}

export function updateTask(taskId: string, updates: Partial<VideoTask>): VideoTask | undefined {
  const task = taskStore.get(taskId);
  if (!task) return undefined;
  
  const updatedTask = {
    ...task,
    ...updates,
    updatedAt: Date.now(),
  };
  taskStore.set(taskId, updatedTask);
  return updatedTask;
}

export function deleteTask(taskId: string): boolean {
  return taskStore.delete(taskId);
}

export function getAllTasks(): VideoTask[] {
  return Array.from(taskStore.values());
}

// 清理过期任务（超过1小时）
export function cleanupOldTasks(): void {
  const ONE_HOUR = 60 * 60 * 1000;
  const now = Date.now();
  
  for (const [id, task] of taskStore.entries()) {
    if (now - task.createdAt > ONE_HOUR) {
      taskStore.delete(id);
    }
  }
}

// 每小时清理一次
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupOldTasks, 60 * 60 * 1000);
}
