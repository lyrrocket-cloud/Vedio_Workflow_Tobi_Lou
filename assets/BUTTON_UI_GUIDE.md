# 按钮UI规范

## 设计主题

### 配色方案
- **主色调**: `#CEA472` (金色)
- **深色背景**: `#0a0a0f`
- **特殊标识色**: `#002D28` (用于地图"住在"标记)
- **文本色**: `#FFFFFF` (主文本) / `#FFFFFF/70` (次要文本)

### 设计原则
- 深色主题配合金色点缀，营造高端视觉体验
- 使用渐变和透明度创造层次感
- 强调微交互反馈（hover、active、disabled状态）

---

## shadcn/ui Button 基础变体

### variant 变体

| 变体 | 基础样式 | 使用场景 |
|------|---------|---------|
| `default` | `bg-primary text-primary-foreground hover:bg-primary/90` | 主要操作按钮 |
| `destructive` | `bg-destructive text-white hover:bg-destructive/90` | 删除、危险操作 |
| `outline` | `border bg-background shadow-xs hover:bg-accent` | 次要操作、取消按钮 |
| `secondary` | `bg-secondary text-secondary-foreground hover:bg-secondary/80` | 辅助操作 |
| `ghost` | `hover:bg-accent hover:text-accent-foreground` | 图标按钮、无框按钮 |
| `link` | `text-primary underline-offset-4 hover:underline` | 链接式按钮 |

### size 尺寸

| 尺寸 | 样式 | 使用场景 |
|------|------|---------|
| `default` | `h-9 px-4 py-2` | 默认按钮 |
| `sm` | `h-8 px-3 gap-1.5` | 小尺寸按钮（工具栏） |
| `lg` | `h-10 px-6` | 大尺寸按钮（主要操作） |
| `icon` | `size-9` | 标准图标按钮 |
| `icon-sm` | `size-8` | 小图标按钮 |
| `icon-lg` | `size-10` | 大图标按钮 |

---

## 项目自定义按钮样式

本项目定义了8种自定义按钮样式，涵盖了所有使用场景：

1. **主按钮** - 确认、保存等主要操作
2. **次要/取消按钮** - 取消、编辑等辅助操作
3. **图标按钮（通用）** - 设置、回到顶部、编辑、关闭等所有图标按钮
4. **Tab切换按钮** - 分类筛选、地图类型切换
5. **分类筛选按钮（圆形/小型）** - 年份、月份筛选
6. **地图状态指示按钮** - 打卡状态筛选
7. **删除/危险操作按钮** - 删除等危险操作
8. **骨架屏/加载按钮** - 占位和加载状态

---

### 1. 主按钮

**样式**:
```css
bg-[#CEA472] hover:bg-[#CEA472]/80 text-[#0a0a0f]
```

**使用场景**:
- 确认添加/保存操作
- 主要功能入口（照片、视频、工具箱）
- 提交表单

**代码示例**:
```tsx
<Button className="bg-[#CEA472] hover:bg-[#CEA472]/80 text-[#0a0a0f]">
  确认添加
</Button>
```

---

### 2. 次要/取消按钮

**样式**:
```css
border-[#CEA472]/30 text-[#CEA472] hover:bg-[#CEA472]/10 hover:text-[#CEA472]
```

**使用场景**:
- 取消操作
- 次要操作按钮
- 编辑、删除按钮（配合图标）

**代码示例**:
```tsx
<Button variant="outline" className="border-[#CEA472]/30 text-[#CEA472] hover:bg-[#CEA472]/10 hover:text-[#CEA472]">
  取消
</Button>
```

**说明**: hover时保持文本颜色为金色，增强视觉反馈效果

---

### 3. 图标按钮（通用）

**样式（标准图标按钮）**:
```css
bg-black/40 border-[#CEA472]/30 hover:bg-[#CEA472]/20 hover:border-[#CEA472]/50
```

**样式（纯文字图标按钮）**:
```css
text-[#CEA472] hover:text-[#CEA472]/80 hover:bg-[#CEA472]/10
```

**使用场景**:
- 设置按钮
- 回到顶部按钮
- 弹窗触发器
- 编辑图标按钮
- 关闭图标按钮
- 所有纯图标操作

**代码示例（标准图标按钮）**:
```tsx
<Button className="bg-black/40 border-[#CEA472]/30 hover:bg-[#CEA472]/20 hover:border-[#CEA472]/50">
  <Settings className="w-4 h-4 text-[#CEA472]" />
</Button>
```

**代码示例（纯文字图标按钮）**:
```tsx
<button className="text-[#CEA472] hover:text-[#CEA472]/80 hover:bg-[#CEA472]/10 p-2 rounded-md">
  <Edit2 className="w-4 h-4" />
</button>
```

**说明**: 根据使用场景选择合适的样式，标准图标按钮有边框和背景，纯文字图标按钮只有hover背景效果

---

### 4. Tab切换按钮

**激活状态**:
```css
bg-[#CEA472] text-[#0a0a0f] font-medium border border-[#CEA472]
```

**非激活状态**:
```css
bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-[#CEA472]/20
```

**使用场景**:
- 照片分类筛选（全部/朋友/家庭）
- 地图类型切换（世界地图/中国地图）

**代码示例**:
```tsx
<button
  className={`rounded-full px-4 py-2 transition-all border ${
    isActive
      ? 'bg-[#CEA472] text-[#0a0a0f] font-medium border-[#CEA472]'
      : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border-[#CEA472]/20'
  }`}
>
  全部
</button>
```

**说明**: 为Tab按钮增加线框，增强视觉边界

---

### 5. 分类筛选按钮（圆形/小型）

**激活状态**:
```css
bg-[#CEA472] border-[#CEA472] scale-110
```

**有照片的非激活状态**:
```css
bg-[#0a0a0f] border-[#CEA472]/50 group-hover/item:border-[#CEA472] group-hover/item:scale-110
```

**无照片的禁用状态**:
```css
bg-[#0a0a0f] border-gray-700
```

**使用场景**:
- 年份筛选按钮（时间轴）
- 月份筛选按钮

**代码示例**:
```tsx
<div
  className={`size-8 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer ${
    isActive
      ? 'bg-[#CEA472] border-[#CEA472] scale-110'
      : hasPhotos
      ? 'bg-[#0a0a0f] border-[#CEA472]/50 group-hover/item:border-[#CEA472] group-hover/item:scale-110'
      : 'bg-[#0a0a0f] border-gray-700'
  }`}
>
  <span>2024</span>
</div>
```

---

### 6. 地图状态指示按钮

**当前选中**:
```css
bg-[#CEA472] border-[#CEA472] text-black font-semibold
```

**已访问**:
```css
bg-[#CEA472]/20 border-[#CEA472]/40 text-[#FFFFFF]
```

**未访问**:
```css
bg-black/30 border-[#CEA472]/10 text-[#FFFFFF]/60 hover:border-[#CEA472]/30
```

**使用场景**:
- 地图图例说明
- 打卡状态筛选

**代码示例**:
```tsx
<button
  className={`px-4 py-1.5 rounded-md border-2 text-sm font-medium transition-all ${
    isActive
      ? 'bg-[#CEA472] border-[#CEA472] text-black font-semibold'
      : isVisited
      ? 'bg-[#CEA472]/20 border-[#CEA472]/40 text-[#FFFFFF]'
      : 'bg-black/30 border-[#CEA472]/10 text-[#FFFFFF]/60 hover:border-[#CEA472]/30'
  }`}
>
  {label}
</button>
```

---

### 7. 删除/危险操作按钮

**样式**:
```css
border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-500
```

**使用场景**:
- 删除操作
- 危险操作
- 需要用户特别警惕的操作

**代码示例**:
```tsx
<Button variant="outline" size="sm" onClick={() => handleDelete()} className="border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-500">
  <Trash2 className="w-4 h-4" />
</Button>
```

**说明**:
- 使用红色边框和文本，强调危险操作
- hover时保持红色文本，增强视觉警示效果
- 背景色变化提供额外的交互反馈

---

### 8. 骨架屏/加载按钮

**样式**:
```css
bg-white/5 text-gray-400 hover:bg-white/10
```

**使用场景**:
- 分类标签未激活时
- 加载状态的占位按钮

**代码示例**:
```tsx
<button className="bg-white/5 text-gray-400 hover:bg-white/10 px-3 py-1.5 rounded-full text-sm">
  {label}
</button>
```

---

## 状态规范

### Disabled 状态
```css
disabled:opacity-50 disabled:cursor-not-allowed
```

### Loading 状态
- 使用 `<Loader2 className="w-4 h-4 animate-spin" />` 图标
- 文本替换为"保存中..." / "加载中..."

**代码示例**:
```tsx
<Button
  className="bg-[#CEA472] hover:bg-[#CEA472]/80 text-[#0a0a0f]"
  disabled={loading}
>
  {loading ? (
    <>
      <Loader2 className="w-4 h-4 animate-spin mr-2" />
      保存中...
    </>
  ) : (
    '保存'
  )}
</Button>
```

---

## 图标使用规范

### 图标尺寸
- 标准按钮: `w-5 h-5`
- 小按钮（size=sm）: `w-4 h-4`
- 图标按钮（size=icon/icon-sm/icon-lg）: 根据容器自动调整

### 图标间距
- 文本 + 图标: 使用 `gap-2`
- 图标 + 文本: 使用 `mr-2`（图标在左）

**代码示例**:
```tsx
<Button className="bg-[#CEA472] hover:bg-[#CEA472]/80 text-[#0a0a0f] gap-2">
  <Camera className="w-5 h-5" />
  照片
</Button>
```

---

## 阴影与装饰

### 主按钮阴影
```css
shadow-lg
```

### 特殊效果（头像光晕）
```css
shadow-2xl shadow-[#CEA472]/20
```

---

## 使用建议

### 按钮组合
- **主操作 + 次要操作**: 使用 `flex gap-2` 或 `flex justify-end gap-2`
- **按钮顺序**: 确认按钮（主按钮）在左，取消按钮（次要按钮）在右
- **按钮组**: 保持视觉对齐，避免过多按钮混杂

### 交互反馈
- 所有按钮都应有 hover 状态
- 主要操作使用明显的主色调
- 危险操作（删除）使用红色边框 + 红色文本，hover时保持文本颜色增强视觉反馈

### 可访问性
- 图标按钮必须添加 `title` 属性说明功能
- Loading 状态应禁用按钮并显示加载图标
- Disabled 状态应降低透明度

---

## 完整示例

### 表单操作按钮组
```tsx
<div className="flex gap-2">
  <Button
    className="bg-[#CEA472] hover:bg-[#CEA472]/80 text-[#0a0a0f]"
    onClick={onConfirm}
    disabled={loading}
  >
    {loading ? (
      <>
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        保存中...
      </>
    ) : (
      '确认添加'
    )}
  </Button>
  <Button
    variant="outline"
    className="border-[#CEA472]/30 text-[#CEA472] hover:bg-[#CEA472]/10 hover:text-[#CEA472]"
    onClick={onCancel}
  >
    取消
  </Button>
</div>
```

**说明**: 确认按钮（主按钮）在左，取消按钮（次要按钮）在右

### 带图标的主要按钮
```tsx
<Button className="gap-2 bg-[#CEA472] hover:bg-[#CEA472]/80 text-[#0a0a0f] shadow-lg font-semibold px-8 border-0">
  <Plus className="w-5 h-5" />
  添加照片
</Button>
```

### 编辑/删除按钮组（小尺寸）
```tsx
<div className="flex gap-2">
  <Button variant="outline" size="sm" onClick={() => handleEdit()} className="border-[#CEA472]/30 text-[#CEA472] hover:bg-[#CEA472]/10 hover:text-[#CEA472]">
    <Edit className="w-4 h-4" />
  </Button>
  <Button variant="outline" size="sm" onClick={() => handleDelete()} className="border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-500">
    <Trash2 className="w-4 h-4" />
  </Button>
</div>
```

### 图标按钮（设置触发器）
```tsx
<Button className="bg-black/40 border-[#CEA472]/30 hover:bg-[#CEA472]/20 hover:border-[#CEA472]/50" title="设置">
  <Settings className="w-4 h-4 text-[#CEA472]" />
</Button>
```

### Tab切换按钮组
```tsx
<div className="flex gap-2">
  <button
    className={`rounded-full px-4 py-2 transition-all border ${
      activeTab === 'all'
        ? 'bg-[#CEA472] text-[#0a0a0f] font-medium border-[#CEA472]'
        : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border-[#CEA472]/20'
    }`}
    onClick={() => setActiveTab('all')}
  >
    全部
  </button>
  <button
    className={`rounded-full px-4 py-2 transition-all border ${
      activeTab === 'friend'
        ? 'bg-[#CEA472] text-[#0a0a0f] font-medium border-[#CEA472]'
        : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border-[#CEA472]/20'
    }`}
    onClick={() => setActiveTab('friend')}
  >
    朋友
  </button>
  <button
    className={`rounded-full px-4 py-2 transition-all border ${
      activeTab === 'family'
        ? 'bg-[#CEA472] text-[#0a0a0f] font-medium border-[#CEA472]'
        : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border-[#CEA472]/20'
    }`}
    onClick={() => setActiveTab('family')}
  >
    家庭
  </button>
</div>
```

---

## 注意事项

1. **颜色一致性**: 始终使用 `#CEA472` 作为主色调，避免随意修改
2. **透明度规范**:
   - 边框透明度通常为 `/30` 或 `/50`
   - 背景透明度通常为 `/10` 或 `/20`
3. **hover 效果**: 主色调的 hover 状态应为 `/80`，其他为 `/10` 或 `/20`
4. **文本颜色**: 主按钮文本为 `text-[#0a0a0f]`，其他为 `text-[#CEA472]` 或 `text-white`
5. **圆角**: 大多数按钮使用 `rounded-md`，Tab按钮使用 `rounded-full`
6. **图标按钮**: 必须添加 `title` 属性说明功能
7. **状态管理**: Loading时必须禁用按钮并显示加载图标
8. **按钮顺序**: 确认按钮（主按钮）在左，取消按钮（次要按钮）在右

---

## 常见问题

### Q: 何时使用主按钮 vs 次要按钮？
A: 主按钮用于最重要的操作（如"保存"、"确认"），次要按钮用于辅助操作（如"取消"、"编辑"）。

### Q: 删除按钮应该用什么颜色？
A: 使用红色边框和文本：`border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-500`

### Q: 图标按钮有尺寸限制吗？
A: 按钮尺寸为 `size-8` 或 `size-9` 时，图标应为 `w-4 h-4`；更大按钮可以使用 `w-5 h-5`。

### Q: 如何处理Loading状态？
A: 使用 `disabled` 属性禁用按钮，并显示 `<Loader2 className="w-4 h-4 animate-spin" />` 图标。

---

## 版本历史

### v1.3.0 (2026-03-29)
- 合并类型3和类型7图标按钮，统一为"图标按钮（通用）"
- 为Tab切换按钮增加线框（非激活状态 `border-[#CEA472]/20`，激活状态 `border-[#CEA472]`）
- 更新所有按钮类型编号（从9种减少为8种）

### v1.2.0 (2026-03-29)
- 优化删除按钮的hover效果，添加 `hover:text-red-500` 增强视觉反馈
- 修正所有表单按钮顺序：确认按钮（主按钮）在左，取消按钮（次要按钮）在右
- 更新删除按钮样式规范
- 新增删除/危险操作按钮独立分类（第8种）

### v1.1.0 (2026-03-29)
- 优化次要/取消按钮的hover效果，添加 `hover:text-[#CEA472]` 增强视觉反馈
- 明确按钮顺序规范：确认按钮（主按钮）在左，取消按钮（次要按钮）在右
- 更新所有代码示例以符合最新规范

### v1.0.0 (2026-03-29)
- 初始版本
- 定义8种项目自定义按钮样式
- 完善状态规范和图标使用规范
- 添加完整代码示例

---

## 快速参考

### 按钮样式速查表

| 按钮类型 | 样式 | Hover效果 | 使用场景 |
|---------|------|----------|---------|
| 主按钮 | `bg-[#CEA472] text-[#0a0a0f]` | `hover:bg-[#CEA472]/80` | 确认、保存 |
| 次要/取消 | `border-[#CEA472]/30 text-[#CEA472]` | `hover:bg-[#CEA472]/10 hover:text-[#CEA472]` | 取消、编辑 |
| 删除/危险 | `border-red-500/30 text-red-500` | `hover:bg-red-500/10 hover:text-red-500` | 删除 |
| 图标按钮 | `bg-black/40 border-[#CEA472]/30` | `hover:bg-[#CEA472]/20 hover:border-[#CEA472]/50` | 设置、触发器 |

### 通用规则

- **按钮顺序**: 确认在左，取消在右
- **图标尺寸**: 标准按钮`w-5 h-5`，小按钮`w-4 h-4`
- **间距**: 文本+图标用`gap-2`，图标+文本用`mr-2`
- **阴影**: 主按钮用`shadow-lg`
- **圆角**: 大部分用`rounded-md`，Tab用`rounded-full`
