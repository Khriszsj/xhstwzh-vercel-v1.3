# 小红书长文转图工作台（Vercel 会话版）
> Xiaohongshu Long-Form Post to Image Studio (Vercel Session Edition)

本项目是一个面向小红书长文创作者的 Next.js 工具，当前版本适配 Vercel Hobby 免费部署。
English: This project is a Next.js tool for Xiaohongshu long-form creators, and this version is adapted for free deployment on Vercel Hobby.

每次打开页面都会进入默认编辑界面，当前标签页内保留编辑状态，刷新或关闭后内容会重置。
English: Each visit starts from the default editor, the current tab keeps its working state, and refresh or close will reset the content.

当前迭代版本：`v1.3.0`
English: Current iteration version: `v1.3.0`

- 富文本编辑（加粗、字号、颜色、换行、空格保留）
  English: Rich text editing (bold, font size, color, line breaks, and preserved spaces)
- 编辑区插图（上传 / 粘贴 / 拖拽）
  English: Insert images into the editor by upload, paste, or drag and drop
- mac 输入法 emoji 直接编辑并导出
  English: Edit and export emoji entered with the macOS input method
- 对话式自然语言排版命令
  English: Conversational natural-language layout commands
- 自动分页预览（1080 x 1440）
  English: Automatic paginated preview (1080 x 1440)
- 浏览器端下载当前页 PNG
  English: Download the current page as PNG directly in the browser
- 浏览器端导出发布包（PNG 图集 + publish.md + meta.json + zip）
  English: Export a publishing bundle in the browser (PNG pages + publish.md + meta.json + zip)

## 0. v1.3 迭代重点
> 0. v1.3 Highlights

- 字号输入框支持手动删除并重新输入任意合法字号，按 Enter 或失焦即时应用到选中文本
  English: Font size input now supports clearing and manually typing any valid size; Enter or blur applies it to the selected text
- 字号输入框获得焦点时自动全选内容，方便快速覆盖输入
  English: The font size input auto-selects its content on focus for quick overwriting
- 输入非法值时自动恢复为当前字号，避免误操作
  English: Invalid input is automatically reverted to the current font size

详细说明见 [docs/ITERATION-1.3.md](docs/ITERATION-1.3.md)。
English: See [docs/ITERATION-1.3.md](docs/ITERATION-1.3.md) for the full iteration notes.

## 0.1. v1.1 迭代重点
> 0.1. v1.1 Highlights

- 左侧栏改为“快捷皮肤在上、页面缩略图在下”
  English: The left sidebar now places quick skins above page thumbnails
- 页面缩略图展示真实分页内容，并增强当前页选中态
  English: Page thumbnails now render real paginated content with a clearer active state
- 点击左侧缩略图可联动到对应编辑内容区域
  English: Clicking a left thumbnail now links back to the corresponding editor content area
- 右侧整合为预览 / 模板 / 调整三标签结构
  English: The right side is reorganized into Preview / Templates / Adjust tabs
- 编辑器工具栏和整体视觉层级完成一轮整理
  English: The editor toolbar and the overall visual hierarchy were refreshed

详细说明见 [docs/ITERATION-1.1.md](docs/ITERATION-1.1.md)。
English: See [docs/ITERATION-1.1.md](docs/ITERATION-1.1.md) for the full iteration notes.

## 1. 环境要求
> 1. Environment Requirements

- Node.js >= 20
  English: Node.js >= 20
- npm >= 10（或 pnpm >= 9）
  English: npm >= 10 (or pnpm >= 9)

## 2. 启动步骤
> 2. Getting Started

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:3000`。
English: Open `http://localhost:3000` in your browser.

## 3. 当前版本特性
> 3. Current Version Behavior

- 不保存历史项目，不连接数据库
  English: No historical project storage and no database connection
- 图片在当前会话中以内嵌数据形式存在
  English: Images are stored as embedded data within the current session
- 刷新页面后，文本和图片都会恢复到默认初始状态
  English: After refresh, both text and images return to the default initial state
- 导出在浏览器端完成，不依赖 Playwright 或服务端磁盘写入
  English: Export runs in the browser and does not rely on Playwright or server-side disk writes

## 4. 目录说明
> 4. Directory Overview

- `app/`：Next.js 页面与轻量 API
  English: `app/`: Next.js pages and lightweight API routes
- `components/`：编辑器、分页预览、会话内交互组件
  English: `components/`: Editor, paginated preview, and session-based interaction components
- `lib/`：文档模型、分页算法、命令引擎、浏览器导出工具
  English: `lib/`: Document model, pagination logic, command engine, and browser export utilities
- `storage/risk_words.txt`：风险词词库原始备份
  English: `storage/risk_words.txt`: Original backup of the risk-word list

## 5. 关键 API
> 5. Key API Endpoints

- `POST /api/editor/command`：自然语言排版命令解析
  English: `POST /api/editor/command`: Parse natural-language layout commands
- `POST /api/paginate`：分页计算
  English: `POST /api/paginate`: Run pagination calculation
- `POST /api/suggestions`：生成标题和标签建议
  English: `POST /api/suggestions`: Generate title and tag suggestions
- `POST /api/compliance/check`：风险词检查
  English: `POST /api/compliance/check`: Check risk words

## 6. 注意事项
> 6. Notes

- 当前版本是 Vercel 测试支线，目标是低成本上线验证
  English: This version is the Vercel testing branch for low-cost deployment validation
- 页面内容只在当前标签页会话中有效
  English: Page content only persists within the current browser tab session
- 若后续要恢复本地版完整持久化能力，应继续在主线仓库开发
  English: If you want to restore the full persistent local version later, continue development in the main repository
