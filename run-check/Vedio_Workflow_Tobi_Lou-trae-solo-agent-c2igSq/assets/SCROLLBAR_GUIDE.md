# 滚动条 UI 规范

## 1. 全局滚动条样式

**适用浏览器**：Webkit 内核浏览器（Chrome、Safari、Edge）

**样式代码**：
```css
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: rgba(206, 164, 114, 0.3);
  border-radius: 4px;
  transition: background 0.3s ease;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(206, 164, 114, 0.5);
}

::-webkit-scrollbar-thumb:active {
  background: rgba(206, 164, 114, 0.7);
}
```

**状态说明**：

| 状态 | 轨道背景色 | 滑块背景色 | 描述 |
|------|-----------|-----------|------|
| 默认 | `rgba(0, 0, 0, 0.2)` | `rgba(206, 164, 114, 0.3)` | 黑色轨道，金色滑块（30% 透明度） |
| 悬停 | `rgba(0, 0, 0, 0.2)` | `rgba(206, 164, 114, 0.5)` | 金色滑块变为 50% 透明度 |
| 按下 | `rgba(0, 0, 0, 0.2)` | `rgba(206, 164, 114, 0.7)` | 金色滑块变为 70% 透明度 |

**圆角**：4px
**过渡动画**：0.3s ease

---

## 2. Firefox 浏览器滚动条

**样式代码**：
```css
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(206, 164, 114, 0.3) rgba(0, 0, 0, 0.2);
}
```

**参数说明**：
- `scrollbar-width: thin` - 滚动条宽度变细
- `scrollbar-color: [滑块颜色] [轨道颜色]` - 金色滑块 + 黑色轨道

---

## 3. 弹窗内滚动条（Dialog）

**适用场景**：弹窗、模态框内滚动条

**样式代码**：
```css
[role="dialog"] ::-webkit-scrollbar,
[data-state="open"] ::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

[role="dialog"] ::-webkit-scrollbar-track,
[data-state="open"] ::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.3);
}

[role="dialog"] ::-webkit-scrollbar-thumb,
[data-state="open"] ::-webkit-scrollbar-thumb {
  background: rgba(206, 164, 114, 0.4);
}
```

**状态说明**：

| 状态 | 轨道背景色 | 滑块背景色 |
|------|-----------|-----------|
| 默认 | `rgba(0, 0, 0, 0.3)` | `rgba(206, 164, 114, 0.4)` |

**尺寸**：6px × 6px（比全局滚动条更细）

---

## 4. 隐藏滚动条工具类

**隐藏横向滚动条**：
```css
.hide-scrollbar-x {
  overflow-x: auto;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.hide-scrollbar-x::-webkit-scrollbar {
  display: none;
}
```

**隐藏纵向滚动条**：
```css
.hide-scrollbar-y {
  overflow-y: auto;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.hide-scrollbar-y::-webkit-scrollbar {
  display: none;
}
```

**使用示例**：
```tsx
// 隐藏横向滚动条
<div className="hide-scrollbar-x">
  <div className="flex gap-4">
    {/* 内容会自动水平滚动，但滚动条隐藏 */}
  </div>
</div>

// 隐藏纵向滚动条
<div className="hide-scrollbar-y">
  <div className="h-[300px] overflow-y-auto">
    {/* 内容会自动垂直滚动，但滚动条隐藏 */}
  </div>
</div>
```

---

## 5. 颜色值参考

| 用途 | 颜色值 | 十六进制 |
|------|--------|----------|
| 滑块颜色（默认） | `rgba(206, 164, 114, 0.3)` | #CEA472 @ 30% |
| 滑块颜色（悬停） | `rgba(206, 164, 114, 0.5)` | #CEA472 @ 50% |
| 滑块颜色（按下） | `rgba(206, 164, 114, 0.7)` | #CEA472 @ 70% |
| 滑块颜色（弹窗） | `rgba(206, 164, 114, 0.4)` | #CEA472 @ 40% |
| 轨道颜色（全局） | `rgba(0, 0, 0, 0.2)` | #000000 @ 20% |
| 轨道颜色（弹窗） | `rgba(0, 0, 0, 0.3)` | #000000 @ 30% |

---

## 6. 视觉特点

- **主色调**：金色（`#CEA472`）
- **轨道色调**：深黑色（`#000000`）
- **圆角**：4px
- **过渡动画**：0.3s ease
- **兼容性**：支持 Webkit 内核浏览器和 Firefox
