# Tab 按钮样式规范 (shadcn/ui)

## 完整代码示例

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

<Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
  {/* ========== Tab 容器 ========== */}
  <TabsList className="grid w-full grid-cols-2 lg:w-[400px] lg:mx-auto bg-black/40 backdrop-blur-sm border border-[#CEA472]/20">
    {/* 
      ===== 每个 Tab 选项 =====
      value: 唯一标识，与 TabsContent 的 value 对应
    */}
    <TabsTrigger 
      value="stats" 
      className="data-[state=active]:text-[#CEA472] data-[state=active]:bg-black/60 text-[#FFFFFF]/60 hover:text-[#FFFFFF]/80 transition-all duration-300"
    >
      驾驶统计
    </TabsTrigger>
    
    <TabsTrigger 
      value="logs" 
      className="data-[state=active]:text-[#CEA472] data-[state=active]:bg-black/60 text-[#FFFFFF]/60 hover:text-[#FFFFFF]/80 transition-all duration-300"
    >
      驾驶记录
    </TabsTrigger>
  </TabsList>

  {/* ========== Tab 内容区 ========== */}
  {/* 与 TabsTrigger 的 value 对应，显示对应内容 */}
  <TabsContent value="stats">
    {/* 这里放驾驶统计的内容 */}
  </TabsContent>
  
  <TabsContent value="logs">
    {/* 这里放驾驶记录的内容 */}
  </TabsContent>
</Tabs>
```

---

## 样式详解

### TabsList 容器样式（Tab 选项的整体容器）

```tsx
className="grid w-full grid-cols-2 lg:w-[400px] lg:mx-auto bg-black/40 backdrop-blur-sm border border-[#CEA472]/20"
```

| 样式类 | 说明 |
|--------|------|
| `grid` | 使用 CSS Grid 网格布局 |
| `w-full` | 宽度占满父容器（移动端自适应） |
| `grid-cols-2` | 分为 2 列（根据 Tab 数量调整：2个Tab用2，3个用3） |
| `lg:w-[400px]` | 大屏幕下固定宽度 400px |
| `lg:mx-auto` | 大屏幕下居中显示 |
| `bg-black/40` | 半透明黑色背景（数字越小越透明，40 = 40%不透明度） |
| `backdrop-blur-sm` | 毛玻璃模糊效果（透过背景能看到模糊的背景图） |
| `border border-[#CEA472]/20` | 金色细边框，20%透明度 |

---

### TabsTrigger 按钮样式（每个 Tab 选项）

```tsx
className="data-[state=active]:text-[#CEA472] data-[state=active]:bg-black/60 text-[#FFFFFF]/60 hover:text-[#FFFFFF]/80 transition-all duration-300"
```

#### 按状态分类：

| 状态 | 样式类 | 说明 |
|------|--------|------|
| **默认状态** | `text-[#FFFFFF]/60` | 白色文字，60%透明度（半透明效果） |
| **鼠标悬浮** | `hover:text-[#FFFFFF]/80` | 悬浮时白色加深到80%透明度 |
| **选中状态** | `data-[state=active]:text-[#CEA472]` | 变成金色文字（表示当前激活） |
| **选中状态** | `data-[state=active]:bg-black/60` | 选中时背景加深（40→60） |
| **通用** | `transition-all duration-300` | 所有变化都加 300ms 动画过渡 |

#### 样式解释：

```tsx
// data-[state=active] 是 shadcn/ui 的特殊写法
// 表示当这个 Tab 被选中时（active 状态）才应用这些样式
data-[state=active]:text-[#CEA472]

// 所以完整的逻辑是：
// - 默认：白色半透明文字
// - 悬浮：白色稍深
// - 选中：金色文字 + 深色背景
```

---

## 设计特点

### 1. 暗色主题
```
深色背景 + 金色点缀 + 白色文字
```

- `bg-black/40` - 半透明深色，像毛玻璃一样
- `#CEA472` - 金色，用于高亮选中状态
- `#FFFFFF` - 白色文字，60%透明度表示未选中，100%表示选中

### 2. 毛玻璃效果
```
backdrop-blur-sm
```
- 背景图片透过 Tab 容器时会有模糊效果
- 视觉上更有层次感

### 3. 状态区分
| 状态 | 文字颜色 | 背景 |
|------|---------|------|
| 默认 | 白色60% | 黑色40% |
| 悬浮 | 白色80% | 不变 |
| 选中 | 金色100% | 黑色60% |

### 4. 响应式
```
w-full grid-cols-2     → 移动端：全宽，2列
lg:w-[400px] lg:mx-auto → 桌面端：固定400px，居中
```

---

## 颜色速查表

| 用途 | 颜色代码 | 效果 |
|------|---------|------|
| 主色调（选中时） | `#CEA472` | 金色 |
| 背景色 | `#0a0a0f` | 深黑 |
| 文字（默认） | `#FFFFFF` / 60% | 半透明白 |
| 文字（选中） | `#FFFFFF` / 100% | 纯白 |
| 按钮背景 | `black/40` | 半透明黑 |
| 按钮背景（选中） | `black/60` | 更深的半透明黑 |

---

## 常见问题

### Q: 如何增加更多 Tab？
修改 `grid-cols-X`（X = Tab数量），然后添加对应的 `TabsTrigger`

```tsx
// 3个Tab的例子
<TabsList className="grid w-full grid-cols-3 lg:w-[500px] lg:mx-auto ...">
  <TabsTrigger value="tab1">选项1</TabsTrigger>
  <TabsTrigger value="tab2">选项2</TabsTrigger>
  <TabsTrigger value="tab3">选项3</TabsTrigger>
</TabsList>
```

### Q: 如何修改激活颜色？
把 `text-[#CEA472]` 改成你喜欢的颜色

```tsx
// 金色
data-[state=active]:text-[#CEA472]
// 蓝色
data-[state=active]:text-blue-500
// 绿色
data-[state=active]:text-green-500
```

---

## 适用场景

- 深色主题的 Web 应用
- 需要毛玻璃效果的现代 UI
- 金色/暗色配色的设计系统
- 移动端适配的响应式布局
