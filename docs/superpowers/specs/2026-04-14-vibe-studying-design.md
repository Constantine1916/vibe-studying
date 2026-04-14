# vibe-studying Design Spec

Date: 2026-04-14

## Overview

vibe-studying is a web-based coding agent interface where users chat with a 3D virtual character. The character is the face of a Claude-powered coding agent that can write, run, and explain code. The user interacts through natural language; the agent handles all code execution inside an isolated Docker container.

This is a standalone new project. Code patterns are inspired by moeru-ai/airi (3D rendering) and qwibitai/nanoclaw (agent architecture), but no forking — everything is written fresh.

## Architecture

```
┌─────────────────────────────────────────┐
│           Frontend (Vue 3 + Vite)        │
│                                         │
│   ┌──────────────┐  ┌─────────────────┐ │
│   │  VRM 3D 人物  │  │   聊天界面       │ │
│   │  Three.js    │  │   消息气泡流      │ │
│   │  three-vrm   │  │                 │ │
│   └──────────────┘  └─────────────────┘ │
└─────────────────┬───────────────────────┘
                  │ WebSocket
┌─────────────────▼───────────────────────┐
│           Backend (Node.js + TypeScript) │
│                                         │
│   WebSocket Server                      │
│   → Message Queue (SQLite)              │
│   → Container Scheduler                 │
└─────────────────┬───────────────────────┘
                  │ Docker stdin/stdout
┌─────────────────▼───────────────────────┐
│           Docker Container              │
│   Claude Agent SDK                      │
│   Tools: Bash / Read / Write /          │
│          Glob / Grep / WebFetch         │
└─────────────────────────────────────────┘
```

## Data Flow

1. User types message → WebSocket → backend
2. Backend enqueues message in SQLite, assigns session
3. Container scheduler starts (or reuses) Docker container for session
4. Message sent to container via stdin as JSON
5. Claude Agent SDK runs tool loop, produces streaming output
6. Output streamed back via stdout → WebSocket → frontend
7. Frontend renders text progressively in chat bubble
8. 3D character plays talking animation while response streams, idles when done

## Directory Structure

```
vibe-studying/
├── frontend/                    # Vue 3 + Vite
│   ├── src/
│   │   ├── components/
│   │   │   ├── VrmViewer.vue    # 3D character renderer (inspired by AIRI)
│   │   │   ├── ChatBubble.vue   # Message bubbles
│   │   │   └── ChatInput.vue    # Text input
│   │   ├── composables/
│   │   │   ├── useVrm.ts        # VRM load/animation control
│   │   │   └── useWebSocket.ts  # WS connection management
│   │   └── App.vue
│   └── package.json
│
├── backend/                     # Node.js + TypeScript
│   ├── src/
│   │   ├── index.ts             # Entry point, starts WS server
│   │   ├── ws-server.ts         # WebSocket server
│   │   ├── queue.ts             # Message queue (inspired by nanoclaw GroupQueue)
│   │   ├── container-runner.ts  # Docker container lifecycle (inspired by nanoclaw)
│   │   └── db.ts                # SQLite message/session storage
│   └── package.json
│
├── agent/                       # Runs inside Docker container
│   ├── src/
│   │   └── index.ts             # Claude Agent SDK entry point
│   ├── Dockerfile
│   └── package.json
│
└── docker-compose.yml
```

## Key Design Decisions

### 1. No fork, fresh codebase
Code patterns are referenced from AIRI and nanoclaw but written from scratch. This avoids dependency on upstream changes and keeps the codebase small and understandable.

### 2. Session = Container
Each user session maps to one persistent Docker container. The container is reused across messages in the same session (not spawned per-message). This matches nanoclaw's GroupQueue model.

### 3. Streaming responses
Agent output is streamed token-by-token from container stdout → WebSocket → frontend. The user sees the response build up in real time, and the 3D character plays a talking animation for the duration.

### 4. 3D character animation is state-driven, not lip-synced
Character states: idle / talking / thinking. No audio-based lip sync (voice input is out of scope). Talking state is triggered when streaming starts, idle when it ends. Thinking state plays while waiting for first token.

### 5. VRM rendering via @pixiv/three-vrm
Same library stack as AIRI: Three.js + @pixiv/three-vrm. Auto-blink and idle animations included. Spring bone physics for natural hair/clothing movement.

### 6. Code execution is real
The Docker container has full Bash access. The agent can write files, run code, install packages, and return output — not just generate code snippets.

## Dependencies

### Frontend
- vue 3, vite, typescript
- @pixiv/three-vrm — VRM character rendering
- three — Three.js
- unocss — utility CSS

### Backend
- typescript, tsx
- ws — WebSocket server
- better-sqlite3 — session/message storage
- dockerode — Docker container management

### Agent (inside container)
- @anthropic-ai/claude-agent-sdk — agent runtime
- @modelcontextprotocol/sdk — MCP tool protocol
- zod — type validation

## Runtime Requirements
- Node.js 20+
- Docker
- Claude API Key (ANTHROPIC_API_KEY)

## Out of Scope (v1)
- Voice input / speech recognition
- Lip sync driven by audio
- Multi-user / multi-session concurrency beyond basic queue
- Mobile rendering (Unity hybrid)
- User authentication
- Persistent conversation history across browser sessions
