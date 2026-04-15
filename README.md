# vibe-studying

和一个 3D 虚拟角色一起学编程。角色背后连接着一个跑在 Docker 容器里的 Claude 编程智能体，可以写代码、执行代码、解释代码。

![架构示意](docs/architecture.png)

## 功能

- **3D VRM 角色**：支持待机、思考、说话三种动画状态
- **实时流式输出**：Claude 的回复逐字显示在聊天面板
- **代码执行**：智能体可以通过 Bash 工具直接运行代码并返回结果
- **会话持久化**：刷新页面不丢失会话（基于 sessionStorage）
- **容器隔离**：每个浏览器会话独享一个 Docker 容器

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + TypeScript + UnoCSS + Three.js + @pixiv/three-vrm |
| 后端 | Node.js + WebSocket (ws) + SQLite (better-sqlite3) + dockerode |
| 智能体 | @anthropic-ai/sdk + computer-use beta（Bash 工具）|
| 容器 | Docker（每个会话一个独立容器）|

## 项目结构

```
vibe-studying/
├── frontend/          # Vue 3 前端
│   ├── src/
│   │   ├── App.vue
│   │   ├── components/
│   │   │   ├── VrmViewer.vue    # Three.js 场景 + VRM 模型
│   │   │   ├── ChatBubble.vue   # 消息气泡
│   │   │   └── ChatInput.vue    # 输入框
│   │   └── composables/
│   │       ├── useWebSocket.ts  # WS 连接 + 消息管理
│   │       └── useVrm.ts        # VRM 动画状态机
│   └── public/
│       └── model.vrm            # VRM 模型文件（不纳入版本控制）
├── backend/           # Node.js 后端
│   └── src/
│       ├── index.ts             # 入口
│       ├── ws-server.ts         # WebSocket 服务器
│       ├── db.ts                # SQLite 数据层
│       ├── queue.ts             # 每会话消息队列
│       └── container-runner.ts  # Docker 容器生命周期管理
├── agent/             # Claude 智能体（运行在 Docker 里）
│   ├── Dockerfile
│   └── src/index.ts             # 读 stdin，调 Claude API，写 stdout
└── docker-compose.yml
```

## 快速开始

### 前置条件

- Node.js 20+
- Docker
- Anthropic API Key

### 1. 克隆并安装依赖

```bash
git clone https://github.com/Constantine1916/vibe-studying.git
cd vibe-studying

# 安装各包依赖
cd frontend && npm install && cd ..
cd backend && npm install && cd ..
cd agent && npm install && cd ..
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入你的 Anthropic API Key
```

### 3. 准备 VRM 模型

把任意 `.vrm` 文件放到 `frontend/public/model.vrm`。

可以从 [VRoid Hub](https://hub.vroid.com) 下载免费模型，或用以下命令获取示例模型：

```bash
curl -L "https://github.com/pixiv/three-vrm/raw/dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm" \
  -o frontend/public/model.vrm
```

### 4. 构建 Agent 镜像

```bash
cd agent
docker build -t vibe-studying-agent .
```

### 5. 启动

**方式一：本地开发模式**

```bash
# 终端 1 — 后端
cd backend
ANTHROPIC_API_KEY=your_key npm run dev

# 终端 2 — 前端
cd frontend
npm run dev
```

打开 http://localhost:5173

**方式二：Docker Compose**

```bash
docker compose up
```

打开 http://localhost:5173

## 工作原理

```
浏览器 ──WS──▶ 后端 ──dockerode──▶ Agent 容器
                 │                      │
                 │◀── 流式文本 ──────────│
                 │
              SQLite
           （会话 + 消息）
```

1. 浏览器通过 WebSocket 发送消息，附带 session ID
2. 后端将消息放入该会话的 FIFO 队列
3. 队列逐条处理：为每条消息启动一个 Docker 容器
4. Agent 容器读取 stdin，调用 Claude API（带 Bash 工具）
5. Claude 的流式回复通过 stdout 哨兵标记（`---STREAM_START---` / `---STREAM_END---`）传回后端
6. 后端将文本块推送到前端，前端更新角色状态和聊天气泡

## 开发

```bash
# 后端 TypeScript 检查
cd backend && npx tsc --noEmit

# 前端 TypeScript 检查
cd frontend && npx tsc --noEmit

# Agent TypeScript 检查
cd agent && npx tsc --noEmit
```

## License

MIT
