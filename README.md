# Qqh Tauri - 音频转写应用

基于 Tauri + React + TypeScript 构建的桌面音频转写应用，使用 Whisper.cpp 进行本地音频转写。

## 技术栈

- **前端**: React 19 + TypeScript + Redux Toolkit + Tailwind CSS + DaisyUI
- **后端**: Rust + Tauri 2.0
- **转写引擎**: Whisper.cpp (whisper-cli)
- **UI 组件**: React Icons + Plyr (音频播放器)

## 核心功能

### 1. 音频资源管理

- **添加音频文件**: 支持选择并导入多种音频格式（MP3、WAV、M4A、FLAC、OGG、AAC、WMA）
- **资源列表**: 以卡片形式展示所有转写资源，按创建时间倒序排列
- **资源详情**: 查看音频文件信息，支持音频播放预览
- **删除资源**: 删除不需要的转写资源（相关任务会保留）

### 2. 转写任务管理

- **创建转写任务**: 
  - 选择 Whisper 模型（tiny、base、small、medium、large-v1、large-v2、large-v3）
  - 设置语言（中文、英文、日语、韩语、自动检测）
  - 配置转写参数（翻译为英文、词级时间戳等）
  
- **任务历史**: 查看每个资源的所有转写任务历史记录
  
- **实时日志**: 实时查看转写任务的运行日志（stdout 和 stderr）
  
- **任务控制**: 
  - 停止正在运行的任务
  - 删除已完成或失败的任务
  
- **结果查看**: 
  - 查看转写结果（JSON 格式）
  - 支持 JSON 格式化显示
  - 自动切换到运行中的任务

### 3. Whisper 模型管理

- **模型下载**: 从 Hugging Face 下载 Whisper 模型文件
- **模型列表**: 查看已下载的模型及其文件大小
- **模型目录**: 打开模型存储文件夹

### 4. 其他功能

- **主题支持**: 支持明暗主题切换（基于 DaisyUI）
- **Toast 通知**: 操作成功/失败的即时反馈
- **响应式布局**: 适配不同屏幕尺寸
- **数据持久化**: 所有资源和任务数据本地存储

## 项目结构

```
qqh-tauri/
├── src/                    # 前端 React 代码
│   ├── componets/         # 通用组件
│   ├── pages/             # 页面组件
│   │   ├── home/          # 首页（资源列表）
│   │   └── resource-detail/ # 资源详情页
│   ├── models/            # 数据模型
│   ├── redux/             # Redux 状态管理
│   ├── utils/             # 工具函数
│   └── config/            # 配置文件
├── src-tauri/             # Tauri 后端代码
│   ├── src/               # Rust 源代码
│   └── tools/             # 打包的工具（whisper-cli）
└── public/                # 静态资源
```

## 开发

### 环境要求

- Node.js 18+
- Rust 1.70+
- Tauri CLI 2.0+

### 安装依赖

```bash
# 安装前端依赖
yarn install

# 或使用 npm
npm install
```

### 运行开发环境

```bash
yarn dev
# 或
npm run dev
```

### 构建应用

```bash
yarn tauri build
# 或
npm run tauri build
```

## 推荐 IDE 设置

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 许可证

MIT
