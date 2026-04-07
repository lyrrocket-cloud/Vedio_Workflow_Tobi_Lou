# 标题样式指南

本文档总结了旅行记账应用中使用的标题样式规范，可直接复制到其他项目中使用。

## 目录

- [1. 标题层级规范](#1-标题层级规范)
- [2. 标题样式分类](#2-标题样式分类)
- [3. 完整代码示例](#3-完整代码示例)
- [4. 设计原则](#4-设计原则)
- [5. 使用建议](#5-使用建议)

---

## 1. 标题层级规范

### H1 - 主标题（页面/应用标题）

用于应用主页的顶级标题，展示项目名称或应用名称。

```tsx
<h1 className="text-5xl font-bold text-white drop-shadow-lg">
  {currentProject?.name || '南疆行旅行记账'}
</h1>
```

**样式说明**：
- 字体大小：`text-5xl` (48px / 3rem)
- 字重：`font-bold` (700)
- 颜色：`text-white` (纯白色)
- 阴影：`drop-shadow-lg` (大阴影效果)

**适用场景**：
- 主页大标题
- 应用名称展示
- 项目名称展示

---

### H2 - 页面标题

用于各个功能页面的标题。

```tsx
<h2 className="text-2xl font-bold text-white mb-6">
  消费录入
</h2>
```

**样式说明**：
- 字体大小：`text-2xl` (24px / 1.5rem)
- 字重：`font-bold` (700)
- 颜色：`text-white` (纯白色)
- 下边距：`mb-6` (24px)

**适用场景**：
- 功能页面标题
- 主要区块标题

**已使用页面**：
- 消费录入
- 消费查询
- 消费分析
- 设置

---

### H3 - 卡片标题

用于卡片内的标题。

```tsx
<CardTitle className="text-2xl font-bold text-white">
  项目管理
</CardTitle>
```

**样式说明**：
- 字体大小：`text-2xl` (24px / 1.5rem)
- 字重：`font-bold` (700)
- 颜色：`text-white` (纯白色)

**适用场景**：
- 卡片组件标题
- 功能区块标题

**已使用场景**：
- 项目管理卡片
- 人员管理卡片

---

## 2. 标题样式分类

### 2.1 对话框标题

#### 标准对话框标题

```tsx
<DialogTitle className="text-2xl font-bold text-white">
  编辑消费记录
</DialogTitle>
```

**样式说明**：
- 字体大小：`text-2xl` (24px / 1.5rem)
- 字重：`font-bold` (700)
- 颜色：`text-white` (纯白色)

**适用场景**：
- 编辑对话框
- 新建项目对话框
- 添加成员对话框

---

#### 警告/危险对话框标题

```tsx
<DialogTitle className="text-xl font-bold text-[#CEA472] flex items-center gap-2">
  <Trash2 className="w-5 h-5" />
  {title}
</DialogTitle>
```

**样式说明**：
- 字体大小：`text-xl` (20px / 1.25rem)
- 字重：`font-bold` (700)
- 颜色：`text-[#CEA472]` (金色)
- 布局：`flex items-center gap-2` (图标+文字)
- 图标尺寸：`w-5 h-5`

**适用场景**：
- 删除确认对话框
- 警告对话框

**图标类型**：
- `Trash2` - 删除图标

---

### 2.2 统计数字标题

```tsx
<div className="text-2xl font-bold text-white">
  {stats.count}
</div>

<div className="text-2xl font-bold text-white">
  ¥{stats.total.toFixed(2)}
</div>
```

**样式说明**：
- 字体大小：`text-2xl` (24px / 1.5rem)
- 字重：`font-bold` (700)
- 颜色：`text-white` (纯白色)

**适用场景**：
- 统计卡片数值
- 重要数字展示

---

### 2.3 小标题/名字标题

```tsx
<div className="text-white font-bold text-lg">
  {item.name}
</div>
```

**样式说明**：
- 字体大小：`text-lg` (18px / 1.125rem)
- 字重：`font-bold` (700)
- 颜色：`text-white` (纯白色)

**适用场景**：
- 列表项名字
- 卡片内的小标题

---

## 3. 完整代码示例

### 3.1 主页标题

```tsx
{/* 标题区域 */}
<div className="text-center mb-8">
  <div className="flex flex-col items-center justify-center gap-4 mb-4">
    {/* 图标容器 - 金色衬底 + 黑色线框 */}
    <div
      className="w-20 h-20 flex items-center justify-center rounded-2xl"
      style={{
        backgroundColor: '#CEA472',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2)'
      }}
    >
      <Wallet className="w-10 h-10" style={{ color: '#0a0a0f' }} />
    </div>

    {/* 主标题 */}
    <h1 className="text-5xl font-bold text-white drop-shadow-lg">
      {currentProject?.name || '南疆行旅行记账'}
    </h1>
  </div>

  {/* 副标题 */}
  {currentProject?.description && (
    <p className="text-white/80 font-normal">{currentProject.description}</p>
  )}
</div>
```

---

### 3.2 功能页面标题

```tsx
{/* 返回按钮和刷新按钮 */}
<div className="flex items-center justify-between mb-6">
  <Button
    variant="outline"
    size="icon"
    onClick={() => router.push('/')}
    className="bg-black/40 border-[#CEA472]/30 text-[#CEA472] hover:bg-[#CEA472]/20 hover:border-[#CEA472]/50"
    title="返回首页"
  >
    <ArrowLeft className="h-4 w-4" />
  </Button>
  <Button
    variant="outline"
    size="icon"
    onClick={loadData}
    className="bg-black/40 border-[#CEA472]/30 text-[#CEA472] hover:bg-[#CEA472]/20 hover:border-[#CEA472]/50"
    title="刷新"
  >
    <RefreshCw className="h-4 w-4" />
  </Button>
</div>

{/* 页面标题 */}
<h2 className="text-2xl font-bold text-white mb-6">
  消费查询
</h2>
```

---

### 3.3 卡片标题

```tsx
<Card className="border-white/10 bg-black/40 backdrop-blur-sm">
  <CardHeader>
    <div className="flex items-center justify-between mb-2">
      <CardTitle className="text-2xl font-bold text-white">
        项目管理
      </CardTitle>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setShowNewProjectDialog(true)}
        className="bg-black/40 border-[#CEA472]/30 text-[#CEA472] hover:bg-[#CEA472]/20 hover:border-[#CEA472]/50"
        title="新建项目"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
    <CardDescription className="text-white/70">
      切换或管理旅行记账项目。点击⭐图标可设置默认项目，每次访问网站时将自动加载该项目。
    </CardDescription>
  </CardHeader>
</Card>
```

---

### 3.4 对话框标题

#### 标准对话框

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="bg-black/95 backdrop-blur-md border-white/10 text-white">
    <DialogHeader>
      <DialogTitle className="text-2xl font-bold text-white">
        编辑消费记录
      </DialogTitle>
      <DialogDescription className="hidden">编辑消费记录表单</DialogDescription>
    </DialogHeader>
    {/* 内容 */}
  </DialogContent>
</Dialog>
```

---

#### 警告对话框

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="bg-[#0a0a0f] border-[#CEA472]/30 text-[#FFFFFF] sm:max-w-[425px]">
    <DialogHeader>
      <DialogTitle className="text-xl font-bold text-[#CEA472] flex items-center gap-2">
        <Trash2 className="w-5 h-5" />
        {title}
      </DialogTitle>
      <DialogDescription className="text-[#FFFFFF]/80 py-4">
        {description}
      </DialogDescription>
    </DialogHeader>
    {/* 内容 */}
  </DialogContent>
</Dialog>
```

---

## 4. 设计原则

### 4.1 颜色系统

| 标题类型 | 颜色类名 | 说明 |
|---------|---------|------|
| 主标题 | `text-white` | 纯白色 |
| 页面标题 | `text-white` | 纯白色 |
| 对话框标题（标准） | `text-white` | 纯白色 |
| 对话框标题（警告） | `text-[#CEA472]` | 金色 |
| 统计数字 | `text-white` | 纯白色 |
| 小标题 | `text-white` | 纯白色 |

### 4.2 字体大小规范

| 标题类型 | Tailwind 类 | 像素值 | rem 值 |
|---------|-----------|-------|--------|
| H1 主标题 | `text-5xl` | 48px | 3rem |
| H2 页面标题 | `text-2xl` | 24px | 1.5rem |
| 卡片标题 | `text-2xl` | 24px | 1.5rem |
| 对话框标题（标准） | `text-2xl` | 24px | 1.5rem |
| 对话框标题（警告） | `text-xl` | 20px | 1.25rem |
| 小标题 | `text-lg` | 18px | 1.125rem |

### 4.3 字重规范

| 标题类型 | 字重类名 | 数值 |
|---------|---------|------|
| 所有标题 | `font-bold` | 700 |

### 4.4 阴影效果

| 标题类型 | 阴影类名 | 说明 |
|---------|---------|------|
| 主标题 | `drop-shadow-lg` | 大阴影，增强立体感 |
| 其他标题 | 无 | 无阴影，保持简洁 |

### 4.5 间距规范

| 标题类型 | 间距类名 | 说明 |
|---------|---------|------|
| 页面标题 | `mb-6` | 下边距 24px |
| 主标题 | 无特殊间距 | 通常与其他元素组合使用 |

### 4.6 特殊效果

#### 警告对话框标题

```tsx
className="text-xl font-bold text-[#CEA472] flex items-center gap-2"
```

**特点**：
- 金色文字，突出警告性质
- Flex 布局，支持图标
- `gap-2` 间距，图标与文字间距

---

## 5. 使用建议

### 5.1 标题选择指南

- **H1 (`text-5xl`)**：仅用于主页的顶级标题，每个页面最多一个
- **H2 (`text-2xl`)**：用于功能页面标题，每个页面一个
- **卡片标题 (`text-2xl`)**：用于卡片组件的标题
- **对话框标题 (`text-2xl` / `text-xl`)**：根据对话框重要性选择
- **小标题 (`text-lg`)**：用于列表项、卡片内的小标题

### 5.2 警告/危险操作提示

- 使用金色 (`text-[#CEA472]`) 标题
- 配合图标增强视觉效果
- 字体大小使用 `text-xl`

### 5.3 标题组合

```tsx
{/* 主标题 + 副标题 */}
<div className="text-center mb-8">
  <h1 className="text-5xl font-bold text-white drop-shadow-lg mb-4">
    主标题
  </h1>
  <p className="text-white/80 font-normal">
    副标题或描述
  </p>
</div>

{/* 标题 + 操作按钮 */}
<div className="flex items-center justify-between mb-6">
  <h2 className="text-2xl font-bold text-white">
    标题
  </h2>
  <Button>操作</Button>
</div>
```

### 5.3 响应式建议

当前标题样式已经是响应式友好的：
- 字体大小在移动端和桌面端保持一致
- 使用 Flex 布局，自动适配
- 无需额外修改

### 5.4 可访问性建议

- 确保标题层级正确（H1 → H2 → H3）
- 使用语义化的 HTML 标签
- 为图标添加适当的 ARIA 标签

---

## 快速参考

### 常用标题类名

```tsx
// H1 - 主标题
text-5xl font-bold text-white drop-shadow-lg

// H2 - 页面标题
text-2xl font-bold text-white mb-6

// 卡片标题
text-2xl font-bold text-white

// 对话框标题（标准）
text-2xl font-bold text-white

// 对话框标题（警告）
text-xl font-bold text-[#CEA472] flex items-center gap-2

// 统计数字
text-2xl font-bold text-white

// 小标题
text-white font-bold text-lg
```

### 图标尺寸

```tsx
// 标题图标（警告对话框）
<Trash2 className="w-5 h-5" />

// 按钮图标
<ArrowLeft className="h-4 w-4" />
```

---

**文档版本**：1.0.0
**最后更新**：2026-04-07
**适用项目**：旅行记账应用
