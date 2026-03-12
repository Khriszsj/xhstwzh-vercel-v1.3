# v1.3 迭代说明 / Iteration Notes

## 概述 / Summary

v1.3 是一次针对编辑器排版控制可用性的修复迭代，聚焦字号手动输入体验的完整修复，使字号调节更精准、更直观。

v1.3 is a usability fix iteration focused on resolving the manual font size input issue in the editor toolbar, making font size adjustment more precise and intuitive.

---

## 变更内容 / What Changed

### 1. 字号输入框手动输入修复 / Font Size Input — Manual Edit Fix

**问题 / Problem：**

选中文本后，字号输入框无法进行手动删除与重新输入。原实现在 `onChange` 中加了范围限制（`v >= 10 && v <= 70`），导致用户清空原有数字时因值不合法而被直接拦截，输入过程无法继续。

After selecting text, the font size input could not be manually cleared and re-typed. The original `onChange` handler applied an immediate range check (`v >= 10 && v <= 70`), which blocked the user mid-edit when the field was empty or contained a partial number.

**修复方案 / Fix：**

引入独立的本地字符串状态 `fontSizeInput` 解耦显示值与实际应用值：

A separate local string state `fontSizeInput` was introduced to decouple the display value from the applied value:

| 时机 / Trigger | 行为 / Behavior |
|---|---|
| `onChange` | 仅更新输入框显示，允许自由编辑 / Only updates display, allows free editing |
| `onFocus` | 锁定当前文本选区 + 全选输入框内容 / Locks text selection + auto-selects input contents |
| `onBlur` 失焦 | 解析并应用字号；非法值时恢复原字号 / Parses and applies font size; reverts on invalid input |
| `Enter` 按键 | 立即解析并应用，等效于失焦确认 / Immediately parses and applies, equivalent to blur |

---

## 兼容性 / Compatibility

- 依旧是会话式：内容仅保留在当前标签页，刷新后重置。
  Still session-based: content remains in the current tab and resets on refresh.
- 导出仍在浏览器端完成，无数据库、无服务端持久化。
  Export still runs in the browser with no database or server-side persistence.
- 所有已有功能（自然语言命令、分页、合规检查、建议生成）不受影响。
  All existing features (natural-language commands, pagination, compliance check, suggestions) remain unaffected.

---

## 涉及文件 / Files Touched

- `components/RichEditor.tsx`
