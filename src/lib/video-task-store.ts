/**
 * 视频生成任务状态存储
 * 使用全局变量确保跨模块共享状态
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
    firstFrameUrl?: string;
    lastFrameUrl?: string;
    prompt: string;
    duration: number;
    resolution: string;
    ratio: string;
    generateAudio: boolean;
  };
}

// 全局任务存储 - 在所有模块实例间共享
declare global {
  var __videoTasks__: Map<string, VideoTask> | undefined;
}

// 延迟初始化，确保全局变量存在
function getTaskStore(): Map<string, VideoTask> {
  if (!global.__videoTasks__) {
    global.__videoTasks__ = new Map();
  }
  return global.__videoTasks__;
}

export function getTask(taskId: string): VideoTask | undefined {
  return getTaskStore().get(taskId);
}

export function setTask(taskId: string, task: VideoTask): void {
  getTaskStore().set(taskId, task);
  console.log('SET', `任务已存储: ${taskId}`, { total: getTaskStore().size });
}

export function updateTask(taskId: string, updates: Partial<VideoTask>): VideoTask | undefined {
  const store = getTaskStore();
  const task = store.get(taskId);
  if (!task) return undefined;
  
  const updatedTask = {
    ...task,
    ...updates,
    updatedAt: Date.now(),
  };
  store.set(taskId, updatedTask);
  console.log('UPDATE', `任务已更新: ${taskId}`, { status: updates.status });
  return updatedTask;
}

export function deleteTask(taskId: string): boolean {
  return getTaskStore().delete(taskId);
}

export function getAllTasks(): VideoTask[] {
  console.log('GET_ALL', `查询所有任务，当前数量: ${getTaskStore().size}`);
  return Array.from(getTaskStore().values());
}

// 清理过期任务（超过1小时）
export function cleanExpiredTasks(): void {
  const store = getTaskStore();
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  
  for (const [taskId, task] of store.entries()) {
    if (task.updatedAt < oneHourAgo) {
      store.delete(taskId);
    }
  }
}
