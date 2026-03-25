# Tobi Lou UI 设计规范 - 实战总结

## 🎯 核心理念

Tobi Lou 设计风格以**高端黑色主题 + 金色点缀**为核心，通过**毛玻璃效果**营造层次感，适用于现代化、高品质的Web应用。

**设计哲学**：Dark, Gold, Glass, Elegance

---

## 🎨 核心色彩系统

### 主色调（不可变）

| 颜色 | 色值 | 应用场景 |
|------|------|----------|
| **主背景** | `#0a0a0f` | 页面整体背景 |
| **主强调色** | `#CEA472` | 重要按钮、图标、hover状态、标签 |
| **主文字** | `#FFFFFF` | 所有正文、标题、按钮文字 |

### 半透明色系（核心）

**背景色 - 半透明黑色**
```css
bg-black/40   /* 卡片背景 - 轻微透明 */
bg-black/60   /* 次要按钮背景 - 中等透明 */
bg-black/80   /* 弹窗背景 - 深色透明 */
```

**文字色 - 半透明白色**
```css
text-[#FFFFFF]        /* 主要文字 - 不透明 */
text-[#FFFFFF]/80     /* 次要文字 - 80%透明度 */
text-[#FFFFFF]/50     /* 弱化文字/占位符 - 50%透明度 */
```

**边框色 - 半透明金色**
```css
border-[#CEA472]/10   /* 卡片/容器边框 - 弱边框 */
border-[#CEA472]/30   /* 输入框/组件边框 - 中等边框 */
border-[#CEA472]/60   ** 按钮边框 - 强边框（重要！）
border-[#CEA472]/20   /* 金色按钮边框 - 浅边框 */
```

---

## 🔴 关键规则（实战经验总结）

### ⚠️ 规则1：按钮必须有背景色

**问题**：在黑色背景上使用透明背景的按钮（如 `variant="outline"`）会导致按钮不可见。

**错误示例**：
```tsx
// ❌ 错误 - 按钮与背景融合，不可见
<Button variant="outline" className="border-[#CEA472]/30 text-[#FFFFFF]">
  取消
</Button>
```

**正确示例**：
```tsx
// ✅ 正确 - 有明显背景色
<Button variant="outline" className="
  bg-black/60 
  border border-[#CEA472]/60 
  text-[#FFFFFF]
">
  取消
</Button>
```

**规则**：所有按钮都必须有背景色，即使是次要按钮也不能完全透明。

---

### ⚠️ 规则2：按钮边框必须足够明显

**问题**：边框透明度过低会导致在深色背景上看不清楚。

**错误示例**：
```tsx
// ❌ 错误 - 边框太淡，不明显
className="bg-black/60 border-[#CEA472]/30"
```

**正确示例**：
```tsx
// ✅ 正确 - 边框清晰可见
className="bg-black/60 border-[#CEA472]/60"
```

**规则**：按钮边框透明度应使用 `60`（38%），避免使用 `30`（18%）或更低。

---

### ⚠️ 规则3：弹框按钮顺序 - 取消在右侧

**问题**：常见交互习惯是主要操作在左，取消在右。

**错误示例**：
```tsx
// ❌ 错误 - 取消在左侧
<DialogFooter>
  <Button variant="outline">取消</Button>
  <Button>保存</Button>
</DialogFooter>
```

**正确示例**：
```tsx
// ✅ 正确 - 取消在右侧
<DialogFooter>
  <Button type="submit">保存</Button>
  <Button variant="outline">取消</Button>
</DialogFooter>
```

**规则**：所有弹框的按钮顺序应为：**[主要操作] [次要操作/取消]**

---

### ⚠️ 规则4：日期选择器必须使用深色主题

**问题**：默认的日期选择器是亮色主题，在黑色背景上非常突兀。

**解决方案**：
```css
/* 全局CSS */
input[type="date"] {
  color-scheme: dark;
}
```

**增强图标颜色**：
```css
input[type="date"]::-webkit-calendar-picker-indicator {
  filter: invert(1) sepia(1) saturate(0.5) hue-rotate(355deg);
  opacity: 0.8;
}
```

**规则**：所有 `type="date"` 的输入框必须配合深色主题CSS。

---

### ⚠️ 规则5：文字颜色必须有足够对比度

**问题**：使用 `text-[#FFFFFF]/60` 在某些背景上可能不够清晰。

**建议**：
- 主要操作按钮文字：使用 `text-[#FFFFFF]`（不透明）
- 次要按钮文字：使用 `text-[#FFFFFF]`，hover时变为金色
- 描述性文本：可使用 `text-[#FFFFFF]/80`
- 占位符：使用 `text-[#FFFFFF]/50`

**规则**：按钮文字颜色应使用不透明白色，避免过度透明。

---

### ⚠️ 规则6：Hover效果必须明显

**问题**：hover效果不明显会导致用户不知道元素是否可交互。

**标准Hover效果**：
```tsx
className="
  bg-black/60 
  border-[#CEA472]/60 
  text-[#FFFFFF]
  hover:bg-[#CEA472]/10      /* 背景变为金色半透明 */
  hover:text-[#CEA472]        /* 文字变为金色 */
  hover:border-[#CEA472]      /* 边框变为金色 */
  transition-all duration-300 /* 平滑过渡 */
"
```

**规则**：所有可交互元素都应有明显的hover效果，推荐时长为 300ms。

---

## 📦 标准组件模板

### 按钮

#### 主要操作按钮（保存、确认、提交）
```tsx
<Button className="
  bg-[#CEA472] 
  hover:bg-[#CEA472]/80 
  text-[#0a0a0f] 
  border border-[#CEA472]/20 
  shadow-lg 
  font-semibold
">
  保存
</Button>
```

#### 次要操作按钮（取消、关闭）⭐ **必须遵守规则1和规则2**
```tsx
<Button variant="outline" className="
  bg-black/60 
  hover:bg-[#CEA472]/10 
  border border-[#CEA472]/60 
  text-[#FFFFFF] 
  hover:text-[#CEA472]
  hover:border-[#CEA472]
">
  取消
</Button>
```

#### 危险操作按钮（删除）
```tsx
<Button className="
  bg-red-600 
  hover:bg-red-700 
  text-white 
  border border-red-700/20 
  shadow-lg
">
  删除
</Button>
```

#### 装饰性按钮（抽签、计算路线等）
```tsx
<Button className="
  bg-black/60 
  hover:bg-black/40 
  border border-[#CEA472]/30 
  text-[#FFFFFF] 
  hover:text-[#CEA472] 
  hover:border-[#CEA472]/50 
  transition-all duration-500
">
  随机模式
</Button>
```

---

### 卡片

```tsx
<Card className="
  border-[#CEA472]/10 
  bg-black/40 
  backdrop-blur-sm 
  hover:border-[#CEA472]/50 
  hover:bg-black/60 
  transition-all duration-500
">
  <CardHeader>
    <CardTitle className="text-[#FFFFFF]">标题</CardTitle>
    <CardDescription className="text-[#FFFFFF]/60">
      描述
    </CardDescription>
  </CardHeader>
  <CardContent>
    内容
  </CardContent>
</Card>
```

---

### 对话框

```tsx
<DialogContent className="
  max-w-md 
  bg-black/80 
  backdrop-blur-sm 
  border-[#CEA472]/20
">
  <DialogHeader>
    <DialogTitle className="text-[#FFFFFF]">标题</DialogTitle>
    <DialogDescription className="text-[#FFFFFF]/60">
      描述
    </DialogDescription>
  </DialogHeader>
  
  <form onSubmit={handleSubmit}>
    <div className="space-y-4 py-4">
      {/* 表单内容 */}
    </div>
    
    {/* ⭐ 按钮顺序：主要操作在前，取消在后 */}
    <DialogFooter>
      <Button type="submit" className="
        bg-[#CEA472] 
        hover:bg-[#CEA472]/80 
        text-[#0a0a0f] 
        border border-[#CEA472]/20
      ">
        保存
      </Button>
      <Button variant="outline" onClick={onCancel} className="
        bg-black/60 
        hover:bg-[#CEA472]/10 
        border border-[#CEA472]/60 
        text-[#FFFFFF] 
        hover:text-[#CEA472]
      ">
        取消
      </Button>
    </DialogFooter>
  </form>
</DialogContent>
```

---

### 输入框

```tsx
<Input
  type="text"
  placeholder="请输入..."
  className="
    bg-black/40 
    backdrop-blur-sm 
    border-[#CEA472]/30 
    text-[#FFFFFF] 
    placeholder:text-[#FFFFFF]/50 
    focus:border-[#CEA472]/50
    focus:ring-0
  "
/>
```

---

### 日期选择器

```tsx
<Input
  type="date"
  className="
    bg-black/40 
    backdrop-blur-sm 
    border-[#CEA472]/30 
    text-[#FFFFFF] 
    focus:border-[#CEA472]/50
  "
/>
```

**配合全局CSS**：
```css
/* globals.css */
input[type="date"] {
  color-scheme: dark;
}

input[type="date"]::-webkit-datetime-edit {
  color: #FFFFFF !important;
}

input[type="date"]::-webkit-calendar-picker-indicator {
  filter: invert(1) sepia(1) saturate(0.5) hue-rotate(355deg);
  opacity: 0.8;
  cursor: pointer;
}
```

---

### 选择器

```tsx
<Select>
  <SelectTrigger className="
    bg-black/40 
    backdrop-blur-sm 
    border-[#CEA472]/30 
    text-[#FFFFFF] 
    focus:border-[#CEA472]/50
    data-[state=open]:text-[#CEA472]
  ">
    <SelectValue placeholder="请选择" />
  </SelectTrigger>
  <SelectContent className="
    bg-black/60 
    backdrop-blur-sm 
    border-[#CEA472]/30
  ">
    <SelectItem value="1" className="
      text-[#FFFFFF] 
      hover:bg-black/40 
      focus:bg-black/40 
      data-[highlighted]:text-[#CEA472] 
      data-[state=checked]:text-[#CEA472]
    ">
      选项
    </SelectItem>
  </SelectContent>
</Select>
```

---

## 🎨 毛玻璃效果规范

### 基础毛玻璃（卡片）
```tsx
className="backdrop-blur-sm bg-black/40 border-[#CEA472]/10"
```

### 深色毛玻璃（弹窗）
```tsx
className="backdrop-blur-sm bg-black/80 border-[#CEA472]/20"
```

### 使用场景
- ✅ 卡片背景：`bg-black/40` + `backdrop-blur-sm`
- ✅ 弹窗背景：`bg-black/80` + `backdrop-blur-sm`
- ✅ 次要按钮背景：`bg-black/60`
- ❌ 不要用于页面整体背景（使用 `#0a0a0f`）

---

## 🎭 交互效果规范

### Hover效果标准

**通用Hover**：
```tsx
className="
  hover:bg-black/60           /* 背景变深 */
  hover:text-[#CEA472]        /* 文字变金色 */
  hover:border-[#CEA472]/50   /* 边框变金色 */
  transition-all duration-300 /* 平滑过渡 */
"
```

**特殊Hover（次要按钮）**：
```tsx
className="
  hover:bg-[#CEA472]/10       /* 背景变为金色半透明 */
  hover:text-[#CEA472]        /* 文字变为金色 */
  hover:border-[#CEA472]      /* 边框变为金色 */
"
```

### 动画时长规范

| 动画类型 | 时长 | 示例 |
|---------|------|------|
| **快速** | 150ms | 按钮hover、输入框focus |
| **标准** | 300ms | 卡片hover、Tab切换 |
| **慢速** | 500ms | 页面过渡、复杂动画 |

---

## 📱 响应式规范

### 常用断点

| 断点 | 最小宽度 | 适用场景 |
|-----|---------|---------|
| **默认** | - | 移动端 |
| **md** | 768px | 平板 |
| **lg** | 1024px | 桌面 |
| **xl** | 1280px | 大屏桌面 |

### 响应式示例

```tsx
{/* 网格布局 - 移动端1列，平板2列，桌面4列 */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
  {/* 内容 */}
</div>

{/* 弹窗宽度 - 移动端全宽，桌面中等宽度 */}
<DialogContent className="max-w-md lg:max-w-2xl">
  {/* 内容 */}
</DialogContent>

{/* 标签页布局 - 移动端全宽，桌面居中 */}
<TabsList className="
  w-full 
  lg:w-[500px] lg:mx-auto
">
  {/* 内容 */}
</TabsList>
```

---

## ⚡ 快速检查清单

在开发新组件时，请对照以下清单：

- [ ] 背景色是否使用 `#0a0a0f` 或半透明黑色？
- [ ] 强调色是否使用 `#CEA472`？
- [ ] 主要文字是否使用 `#FFFFFF`？
- [ ] 按钮是否有背景色？（**关键**）
- [ ] 按钮边框是否清晰可见？（使用 `border-[#CEA472]/60`）
- [ ] 弹框按钮顺序是否正确？（主要操作在前，取消在后）
- [ ] 所有可交互元素是否有hover效果？
- [ ] 日期选择器是否使用了深色主题？
- [ ] 是否使用了 `backdrop-blur-sm` 增强毛玻璃效果？
- [ ] 过渡动画时长是否合理？（300ms为标准）

---

## 🚫 常见错误及修复

### 错误1：按钮不可见

**症状**：按钮与背景颜色相同，无法识别。

**原因**：使用 `variant="outline"` 但没有添加背景色。

**修复**：添加 `bg-black/60`

```tsx
// ❌ 错误
<Button variant="outline">取消</Button>

// ✅ 正确
<Button variant="outline" className="bg-black/60 border-[#CEA472]/60 text-[#FFFFFF]">取消</Button>
```

---

### 错误2：按钮边框太淡

**症状**：边框几乎看不见。

**原因**：边框透明度过低（如 `border-[#CEA472]/10`）。

**修复**：使用 `border-[#CEA472]/60`

```tsx
// ❌ 错误
className="bg-black/60 border-[#CEA472]/10"

// ✅ 正确
className="bg-black/60 border-[#CEA472]/60"
```

---

### 错误3：日期选择器是亮色

**症状**：日期选择器弹窗是白色，与黑色背景不协调。

**原因**：没有设置深色主题。

**修复**：添加 `color-scheme: dark`

```css
/* globals.css */
input[type="date"] {
  color-scheme: dark;
}
```

---

### 错误4：hover效果不明显

**症状**：鼠标悬停时没有明显变化。

**原因**：hover样式过于简单或动画时长太短。

**修复**：添加完整的hover效果和过渡动画

```tsx
// ❌ 错误
className="bg-black/60 hover:bg-black/70"

// ✅ 正确
className="
  bg-black/60 
  hover:bg-[#CEA472]/10 
  hover:text-[#CEA472] 
  hover:border-[#CEA472] 
  transition-all duration-300
"
```

---

## 📚 最佳实践

### 1. 始终使用半透明背景
卡片、弹窗、按钮等容器都应使用半透明黑色背景，配合 `backdrop-blur-sm`。

### 2. 保持一致的透明度
- 卡片背景：`bg-black/40`
- 次要按钮：`bg-black/60`
- 弹窗背景：`bg-black/80`

### 3. 金色用于强调
金色（#CEA472）仅用于强调元素，不要大面积使用。

### 4. 边框要有层次
使用不同的透明度区分边框重要性：
- 弱边框：`border-[#CEA472]/10`（10%）
- 中等边框：`border-[#CEA472]/30`（18%）
- 强边框：`border-[#CEA472]/60`（38%）

### 5. 动画要平滑
所有交互效果都应使用 `transition-all`，时长为 300ms。

---

## 🎯 总结

Tobi Lou UI 设计的核心是：

1. **黑色背景**（#0a0a0f）+ **金色点缀**（#CEA472）
2. **毛玻璃效果**（backdrop-blur-sm + 半透明背景）
3. **清晰的层次**（通过边框透明度和背景透明度）
4. **明显的交互**（hover效果 + 平滑动画）
5. **统一的规范**（严格按照标准模板）

遵循本规范，可以确保应用具有统一、高端、专业的视觉效果。

---

## 📄 版本信息

**版本**: v1.0  
**日期**: 2026-03-12  
**基于**: "今天谁开车"应用实际开发经验  
**维护者**: Vibe Coding Team
