# 视频工作流项目 Code Wiki

## 目录
- [项目概述](#项目概述)
- [技术架构](#技术架构)
- [项目结构](#项目结构)
- [核心模块](#核心模块)
- [API文档](#api文档)
- [开发指南](#开发指南)
- [部署指南](#部署指南)
- [常见问题](#常见问题)

---

## 项目概述

### 项目简介
本项目是一个基于 Next.js 的 AI 视频生成应用，提供以下核心功能：
- **视频生成**：支持上传首帧和尾帧图片，通过 AI 生成流畅的转场视频
- **配音生成**：提供 AI 配音功能，支持文本转语音
- **音效生成**：根据描述生成匹配的音效
- **任务管理**：完整的任务状态跟踪和管理系统

### 核心特性
- 双模型支持：同时支持 Coze Seedance 1.5 Pro 和火山方舟 Seedance 1.5 Pro
- 灵活的参数配置：支持视频时长、分辨率、宽高比等
- 实时任务监控：支持 SSE 实时状态更新
- 任务历史管理：支持任务查询、取消、删除

---

## 技术架构

### 技术栈
- **前端框架**：Next.js 16.1.1 (App Router)
- **UI 组件**：shadcn/ui + Radix UI
- **样式方案**：Tailwind CSS 4
- **状态管理**：React Hooks + 全局变量存储
- **类型安全**：TypeScript 5.x
- **包管理器**：pnpm 9.x

### 核心依赖
- `coze-coding-dev-sdk`：视频生成 SDK
- `lucide-react`：图标库
- `@aws-sdk/client-s3`：对象存储
- `react-hook-form`：表单处理

### 架构设计

```
┌─────────────────┐    ┌──────────────────────┐    ┌───────────────────────┐
│   前端界面      │───▶│   Next.js 应用层     │───▶│   第三方 API         │
│  (React 组件)   │    │  (页面 + API 路由)   │    │  - 视频生成          │
└─────────────────┘    └──────────────────────┘    │  - 语音合成          │
                        │                           │  - 对象存储          │
                        ▼                           └───────────────────────┘
              ┌──────────────────────┐
              │   业务逻辑层         │
              │  - 任务状态管理      │
              │  - 文件上传处理      │
              │  - SSE 状态推送      │
              └──────────────────────┘
```

### 数据流
1. 用户在前端上传图片并填写参数
2. 图片上传至对象存储，获取 URL
3. 提交视频生成任务至 API 路由
4. 任务状态存储在全局变量中
5. 通过 SSE 或轮询获取任务状态
6. 生成完成后返回视频 URL

---

## 项目结构

### 目录树
```
/workspace
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API 路由
│   │   │   ├── generate-video-ark/     # 火山方舟视频生成
│   │   │   ├── generate-video-async/   # 异步视频生成
│   │   │   ├── upload/                 # 文件上传
│   │   │   ├── voice-clone/            # 配音生成
│   │   │   ├── video-tasks/            # 任务列表
│   │   │   └── ...
│   │   ├── page.tsx            # 主页面
│   │   ├── layout.tsx          # 根布局
│   │   └── globals.css         # 全局样式
│   ├── components/             # React 组件
│   │   └── ui/                 # shadcn/ui 组件
│   ├── lib/                    # 工具库
│   │   ├── utils.ts            # 工具函数
│   │   └── video-task-store.ts # 任务状态存储
│   └── server.ts               # 自定义服务器
├── assets/                     # 静态资源
├── scripts/                    # 脚本文件
├── package.json
├── next.config.ts
└── tsconfig.json
```

### 关键文件说明

| 文件 | 职责 |
|------|------|
| `src/app/page.tsx` | 主页面，包含所有 UI 和交互逻辑 |
| `src/lib/video-task-store.ts` | 全局任务状态存储和管理 |
| `src/app/api/generate-video-ark/route.ts` | 火山方舟视频生成 API |
| `src/app/api/upload/route.ts` | 文件上传 API |
| `src/app/api/voice-clone/route.ts` | 配音生成 API |

---

## 核心模块

### 1. 任务状态管理模块

**文件位置**：`src/lib/video-task-store.ts`

**功能**：
- 全局任务存储（使用全局变量跨模块共享）
- 任务 CRUD 操作
- 过期任务清理

**核心接口**：
```typescript
interface VideoTask {
  id: string;
  status: TaskStatus; // queued | running | succeeded | failed | cancelled
  videoUrl?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
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
```

**核心函数**：
- `getTask(taskId)` - 获取单个任务
- `setTask(taskId, task)` - 设置任务
- `updateTask(taskId, updates)` - 更新任务
- `deleteTask(taskId)` - 删除任务
- `getAllTasks()` - 获取所有任务
- `cleanExpiredTasks()` - 清理过期任务（1小时）

### 2. 主页面模块

**文件位置**：`src/app/page.tsx`

**功能**：
- 视频生成界面（首帧/尾帧上传、参数配置）
- 配音生成界面
- 音效生成界面
- 任务监控面板
- 视频预览和下载

**关键状态**：
```typescript
const [firstFrame, setFirstFrame] = useState<File | null>(null);
const [lastFrame, setLastFrame] = useState<File | null>(null);
const [prompt, setPrompt] = useState<string>('');
const [duration, setDuration] = useState<number>(5);
const [resolution, setResolution] = useState<string>('720p');
const [ratio, setRatio] = useState<string>('16:9');
const [selectedModel, setSelectedModel] = useState<'coze' | 'ark'>('ark');
```

---

## API文档

### 视频生成 API

#### 1. 火山方舟视频生成

**接口**：`POST /api/generate-video-ark`

**请求参数**：
```json
{
  "firstFrameUrl": "https://...", // 可选
  "lastFrameUrl": "https://...",  // 可选
  "prompt": "转场描述",
  "duration": 5,
  "resolution": "720p",
  "ratio": "16:9",
  "generateAudio": true
}
```

**响应**：
```json
{
  "success": true,
  "taskId": "...",
  "status": "succeeded",
  "videoUrl": "https://..."
}
```

#### 2. 异步视频生成

**接口**：`POST /api/generate-video-async`

**功能**：提交任务后立即返回，通过回调或轮询获取结果

---

### 文件上传 API

**接口**：`POST /api/upload`

**请求**：`multipart/form-data` - `file` 字段

**响应**：
```json
{
  "success": true,
  "url": "https://...", // 预签名 URL（有效期2小时）
  "key": "transition-frames/..."
}
```

**限制**：
- 仅支持图片文件
- 最大 10MB

---

### 配音生成 API

**接口**：`POST /api/voice-clone`

**请求**：
```json
{
  "text": "要合成的文本"
}
```

**响应**：
```json
{
  "success": true,
  "audioUrl": "data:audio/mp3;base64,...",
  "duration": 5.2
}
```

---

### 任务管理 API

#### 获取任务列表

**接口**：`GET /api/video-tasks?status=xxx`

**响应**：
```json
{
  "success": true,
  "tasks": [...],
  "stats": {
    "total": 10,
    "queued": 2,
    "running": 1,
    "succeeded": 5,
    "failed": 2
  }
}
```

#### 取消任务

**接口**：`POST /api/video-cancel/:taskId`

#### 删除任务

**接口**：`DELETE /api/video-delete/:taskId`

#### SSE 状态监控

**接口**：`GET /api/video-status-sse/:taskId`

**事件类型**：
- `status` - 状态更新
- `complete` - 任务完成
- `error` - 任务失败

---

## 开发指南

### 环境要求
- Node.js 18+
- pnpm 9.x

### 本地开发

1. **安装依赖**
```bash
pnpm install
```

2. **启动开发服务器**
```bash
pnpm dev
# 或使用脚本
bash scripts/dev.sh
```

3. **访问应用**
打开浏览器访问 `http://localhost:5000`

### 构建和运行

```bash
# 构建
pnpm build

# 启动生产服务器
pnpm start
```

### 代码检查

```bash
# 类型检查
pnpm ts-check

# 代码检查
pnpm lint
```

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `ARK_API_KEY` | 火山方舟 API Key | 内置 |
| `ARK_BASE_URL` | 火山方舟 API 地址 | https://ark.cn-beijing.volces.com/api/v3 |
| `ARK_MODEL` | 火山方舟模型 ID | ep-20260413164845-qq85t |
| `VOLC_API_KEY` | 火山语音 API Key | 内置 |
| `COZE_PROJECT_DOMAIN_DEFAULT` | 回调域名 | http://localhost:5000 |

---

## 部署指南

### 部署方式

项目支持多种部署方式：
- 使用 Coze 平台部署（推荐）
- Vercel 部署
- Docker 部署

### 使用 Coze 部署

1. 连接仓库到 Coze
2. 配置环境变量
3. 点击部署

### 生产环境配置

1. 设置正确的 `COZE_PROJECT_DOMAIN_DEFAULT`
2. 配置对象存储权限
3. 设置 API 密钥

---

## 常见问题

### Q: 任务一直处于 running 状态怎么办？
A: 检查网络连接，或尝试使用模拟模式测试流程。

### Q: 上传图片失败？
A: 检查图片大小（不超过 10MB）和格式（仅支持图片）。

### Q: 如何切换视频生成模型？
A: 在页面的「生成设置」中选择「Coze」或「火山方舟」。

---

## 贡献指南

1. Fork 项目
2. 创建特性分支
3. 提交更改
4. 发起 Pull Request

---

## 更新日志

### v0.1.0
- 初始版本发布
- 支持视频生成、配音、音效功能
- 双模型支持
- 任务管理系统
