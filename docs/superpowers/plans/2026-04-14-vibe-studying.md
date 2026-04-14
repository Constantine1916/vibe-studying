# vibe-studying Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web app where users chat with a 3D VRM character that fronts a Claude-powered coding agent running in a Docker container.

**Architecture:** Frontend (Vue 3 + Three.js + @pixiv/three-vrm) connects via WebSocket to a Node.js backend that manages Docker containers. Each browser session gets one persistent container running the Claude Agent SDK, which can write and execute code via Bash.

**Tech Stack:** Vue 3, Vite, TypeScript, @pixiv/three-vrm, Three.js, UnoCSS, ws, better-sqlite3, dockerode, @anthropic-ai/claude-agent-sdk

---

## File Map

```
vibe-studying/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── uno.config.ts
│   └── src/
│       ├── main.ts
│       ├── App.vue
│       ├── components/
│       │   ├── VrmViewer.vue      # Three.js canvas + VRM model
│       │   ├── ChatBubble.vue     # Single message bubble (user or agent)
│       │   └── ChatInput.vue      # Text input + send button
│       └── composables/
│           ├── useVrm.ts          # VRM load, animation state machine
│           └── useWebSocket.ts    # WS connection, message send/receive
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts               # Entry: start WS server
│       ├── ws-server.ts           # WebSocket server, session routing
│       ├── db.ts                  # SQLite: sessions + messages
│       ├── queue.ts               # Per-session queue, concurrency control
│       └── container-runner.ts    # Docker container lifecycle + stdio bridge
│
├── agent/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts               # Claude Agent SDK runner (reads stdin, streams stdout)
│
└── docker-compose.yml
```

---

## Task 1: Repo scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `backend/package.json`
- Create: `agent/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/uno.config.ts`
- Create: `frontend/index.html`
- Create: `backend/tsconfig.json`
- Create: `agent/tsconfig.json`

- [ ] **Step 1: Scaffold frontend with Vite**

```bash
cd /home/claude/vibe-studying
npm create vite@latest frontend -- --template vue-ts
cd frontend
npm install
npm install three @pixiv/three-vrm unocss @unocss/preset-uno @unocss/preset-attributify
```

- [ ] **Step 2: Configure UnoCSS**

Create `frontend/uno.config.ts`:
```ts
import { defineConfig, presetUno, presetAttributify } from 'unocss'

export default defineConfig({
  presets: [presetUno(), presetAttributify()],
})
```

- [ ] **Step 3: Wire UnoCSS into Vite**

Edit `frontend/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  plugins: [vue(), UnoCSS()],
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
})
```

- [ ] **Step 4: Scaffold backend**

```bash
cd /home/claude/vibe-studying
mkdir -p backend/src
cd backend
npm init -y
npm install ws better-sqlite3 dockerode
npm install -D typescript tsx @types/node @types/ws @types/better-sqlite3 @types/dockerode
```

- [ ] **Step 5: Create backend tsconfig**

Create `backend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Scaffold agent**

```bash
cd /home/claude/vibe-studying
mkdir -p agent/src
cd agent
npm init -y
npm install @anthropic-ai/claude-agent-sdk zod
npm install -D typescript @types/node tsx
```

- [ ] **Step 7: Create agent tsconfig**

Create `agent/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 8: Commit**

```bash
cd /home/claude/vibe-studying
git add .
git commit -m "feat: scaffold frontend, backend, agent packages"
```

---

## Task 2: SQLite db layer (backend)

**Files:**
- Create: `backend/src/db.ts`

- [ ] **Step 1: Write db.ts**

Create `backend/src/db.ts`:
```ts
import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '../../data/vibe.db')

const db = new Database(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    container_id TEXT
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`)

export function createSession(id: string): void {
  db.prepare('INSERT INTO sessions (id, created_at) VALUES (?, ?)').run(id, Date.now())
}

export function getSession(id: string): { id: string; container_id: string | null } | undefined {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any
}

export function setContainerId(sessionId: string, containerId: string): void {
  db.prepare('UPDATE sessions SET container_id = ? WHERE id = ?').run(containerId, sessionId)
}

export function saveMessage(sessionId: string, role: 'user' | 'agent', content: string): void {
  db.prepare('INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)').run(
    sessionId, role, content, Date.now()
  )
}

export function getMessages(sessionId: string): Array<{ role: string; content: string }> {
  return db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as any
}
```

- [ ] **Step 2: Create data directory**

```bash
mkdir -p /home/claude/vibe-studying/data
echo "data/*.db" >> /home/claude/vibe-studying/.gitignore
```

- [ ] **Step 3: Commit**

```bash
cd /home/claude/vibe-studying
git add .
git commit -m "feat: add SQLite db layer for sessions and messages"
```

---

## Task 3: Agent runner (Docker container)

**Files:**
- Create: `agent/src/index.ts`
- Create: `agent/Dockerfile`

- [ ] **Step 1: Write agent/src/index.ts**

Create `agent/src/index.ts`:
```ts
import Anthropic from '@anthropic-ai/claude-agent-sdk'

interface ContainerInput {
  sessionId: string
  message: string
}

async function main() {
  let inputData = ''
  process.stdin.setEncoding('utf8')

  for await (const chunk of process.stdin) {
    inputData += chunk
  }

  const input: ContainerInput = JSON.parse(inputData)

  const client = new Anthropic()

  process.stdout.write('---STREAM_START---\n')

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 8096,
    system: `You are a helpful coding agent. You can write, run, and explain code.
When asked to write code, write it and then run it using the Bash tool to show the result.
Be concise and friendly.`,
    messages: [{ role: 'user', content: input.message }],
    tools: [
      {
        type: 'bash_20250124',
        name: 'bash',
      },
      {
        type: 'text_editor_20250124',
        name: 'str_replace_based_edit_tool',
      },
    ],
    betas: ['interleaved-thinking-2025-05-14'],
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      process.stdout.write(event.delta.text)
    }
  }

  process.stdout.write('\n---STREAM_END---\n')
}

main().catch((err) => {
  process.stderr.write(`Agent error: ${err.message}\n`)
  process.exit(1)
})
```

- [ ] **Step 2: Write Dockerfile**

Create `agent/Dockerfile`:
```dockerfile
FROM node:20-slim

WORKDIR /app

# Install basic tools the agent can use via Bash
RUN apt-get update && apt-get install -y \
  bash curl git python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npx tsc

CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: Build and test the agent image locally**

```bash
cd /home/claude/vibe-studying/agent
docker build -t vibe-studying-agent .
echo '{"sessionId":"test","message":"Write a Python hello world and run it"}' | \
  docker run -i -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY vibe-studying-agent
```

Expected: streaming text output between `---STREAM_START---` and `---STREAM_END---` markers showing Claude writing and running code.

- [ ] **Step 4: Commit**

```bash
cd /home/claude/vibe-studying
git add .
git commit -m "feat: add Claude Agent SDK runner with Dockerfile"
```

---

## Task 4: Container runner (backend)

**Files:**
- Create: `backend/src/container-runner.ts`

- [ ] **Step 1: Write container-runner.ts**

Create `backend/src/container-runner.ts`:
```ts
import Docker from 'dockerode'

const docker = new Docker()
const IMAGE_NAME = 'vibe-studying-agent'

export interface RunResult {
  onChunk: (cb: (text: string) => void) => void
  onDone: (cb: () => void) => void
  onError: (cb: (err: Error) => void) => void
}

export async function runAgentInContainer(
  sessionId: string,
  message: string,
  apiKey: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): Promise<void> {
  const input = JSON.stringify({ sessionId, message })

  const container = await docker.createContainer({
    Image: IMAGE_NAME,
    Env: [`ANTHROPIC_API_KEY=${apiKey}`],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    OpenStdin: true,
    StdinOnce: true,
    Tty: false,
  })

  await container.start()

  // Send input via stdin
  const stream = await container.attach({ stream: true, stdin: true, stdout: true, stderr: true })
  stream.write(input)
  stream.end()

  let buffer = ''
  let streaming = false

  container.modem.demuxStream(stream, 
    // stdout
    {
      write(chunk: Buffer) {
        buffer += chunk.toString()
        
        if (!streaming && buffer.includes('---STREAM_START---\n')) {
          streaming = true
          buffer = buffer.split('---STREAM_START---\n')[1] || ''
        }

        if (streaming) {
          const endIdx = buffer.indexOf('\n---STREAM_END---')
          if (endIdx !== -1) {
            const finalText = buffer.slice(0, endIdx)
            if (finalText) onChunk(finalText)
            onDone()
            buffer = ''
            streaming = false
          } else {
            onChunk(buffer)
            buffer = ''
          }
        }
      }
    },
    // stderr
    {
      write(chunk: Buffer) {
        process.stderr.write(`[container ${sessionId}] ${chunk.toString()}`)
      }
    }
  )

  const result = await container.wait()
  await container.remove()

  if (result.StatusCode !== 0) {
    onError(new Error(`Container exited with code ${result.StatusCode}`))
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/claude/vibe-studying
git add backend/src/container-runner.ts
git commit -m "feat: add Docker container runner with streaming stdout"
```

---

## Task 5: Message queue (backend)

**Files:**
- Create: `backend/src/queue.ts`

- [ ] **Step 1: Write queue.ts**

Create `backend/src/queue.ts`:
```ts
type Job = () => Promise<void>

// One queue per session — ensures messages are processed in order
const queues = new Map<string, Job[]>()
const running = new Set<string>()

export function enqueue(sessionId: string, job: Job): void {
  if (!queues.has(sessionId)) {
    queues.set(sessionId, [])
  }
  queues.get(sessionId)!.push(job)
  drain(sessionId)
}

async function drain(sessionId: string): Promise<void> {
  if (running.has(sessionId)) return
  const queue = queues.get(sessionId)
  if (!queue || queue.length === 0) return

  running.add(sessionId)
  const job = queue.shift()!

  try {
    await job()
  } catch (err) {
    console.error(`Queue job failed for session ${sessionId}:`, err)
  } finally {
    running.delete(sessionId)
    drain(sessionId)
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/claude/vibe-studying
git add backend/src/queue.ts
git commit -m "feat: add per-session message queue"
```

---

## Task 6: WebSocket server (backend)

**Files:**
- Create: `backend/src/ws-server.ts`
- Create: `backend/src/index.ts`

- [ ] **Step 1: Write ws-server.ts**

Create `backend/src/ws-server.ts`:
```ts
import { WebSocketServer, WebSocket } from 'ws'
import { randomUUID } from 'crypto'
import { createSession, getSession, saveMessage } from './db.js'
import { enqueue } from './queue.js'
import { runAgentInContainer } from './container-runner.js'

const API_KEY = process.env.ANTHROPIC_API_KEY!

if (!API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is required')
}

export type WsMessage =
  | { type: 'init'; sessionId?: string }
  | { type: 'user_message'; text: string }

export type WsEvent =
  | { type: 'session_ready'; sessionId: string }
  | { type: 'agent_chunk'; text: string }
  | { type: 'agent_done' }
  | { type: 'agent_thinking' }
  | { type: 'error'; message: string }

function send(ws: WebSocket, event: WsEvent) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event))
  }
}

export function createWsServer(port: number) {
  const wss = new WebSocketServer({ port })

  wss.on('connection', (ws) => {
    let sessionId: string | null = null

    ws.on('message', (raw) => {
      let msg: WsMessage
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        send(ws, { type: 'error', message: 'Invalid JSON' })
        return
      }

      if (msg.type === 'init') {
        sessionId = msg.sessionId ?? randomUUID()
        if (!getSession(sessionId)) {
          createSession(sessionId)
        }
        send(ws, { type: 'session_ready', sessionId })
        return
      }

      if (msg.type === 'user_message') {
        if (!sessionId) {
          send(ws, { type: 'error', message: 'Send init first' })
          return
        }

        const text = msg.text
        saveMessage(sessionId, 'user', text)
        send(ws, { type: 'agent_thinking' })

        enqueue(sessionId, async () => {
          await runAgentInContainer(
            sessionId!,
            text,
            API_KEY,
            (chunk) => send(ws, { type: 'agent_chunk', text: chunk }),
            () => {
              saveMessage(sessionId!, 'agent', '[streamed]')
              send(ws, { type: 'agent_done' })
            },
            (err) => send(ws, { type: 'error', message: err.message }),
          )
        })
      }
    })

    ws.on('close', () => {
      console.log(`Session ${sessionId} disconnected`)
    })
  })

  console.log(`WebSocket server running on ws://localhost:${port}`)
  return wss
}
```

- [ ] **Step 2: Write index.ts**

Create `backend/src/index.ts`:
```ts
import { createWsServer } from './ws-server.js'

const PORT = Number(process.env.PORT ?? 3001)
createWsServer(PORT)
```

- [ ] **Step 3: Add dev script to backend/package.json**

Edit `backend/package.json` to add:
```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

- [ ] **Step 4: Test backend manually**

```bash
cd /home/claude/vibe-studying/backend
ANTHROPIC_API_KEY=your_key_here npm run dev
```

Expected: `WebSocket server running on ws://localhost:3001`

- [ ] **Step 5: Commit**

```bash
cd /home/claude/vibe-studying
git add backend/src/ws-server.ts backend/src/index.ts backend/package.json
git commit -m "feat: add WebSocket server with session routing"
```

---

## Task 7: useWebSocket composable (frontend)

**Files:**
- Create: `frontend/src/composables/useWebSocket.ts`

- [ ] **Step 1: Write useWebSocket.ts**

Create `frontend/src/composables/useWebSocket.ts`:
```ts
import { ref, onUnmounted } from 'vue'

export type CharacterState = 'idle' | 'thinking' | 'talking'

export interface Message {
  id: string
  role: 'user' | 'agent'
  text: string
  streaming?: boolean
}

export function useWebSocket() {
  const messages = ref<Message[]>([])
  const characterState = ref<CharacterState>('idle')
  const sessionId = ref<string | null>(null)
  const connected = ref(false)

  let ws: WebSocket | null = null
  let currentAgentMessageId: string | null = null

  function connect() {
    ws = new WebSocket(`ws://${location.host}/ws`)

    ws.onopen = () => {
      connected.value = true
      const stored = sessionStorage.getItem('vibe-session-id')
      ws!.send(JSON.stringify({ type: 'init', sessionId: stored ?? undefined }))
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)

      if (msg.type === 'session_ready') {
        sessionId.value = msg.sessionId
        sessionStorage.setItem('vibe-session-id', msg.sessionId)
      }

      if (msg.type === 'agent_thinking') {
        characterState.value = 'thinking'
        const id = crypto.randomUUID()
        currentAgentMessageId = id
        messages.value.push({ id, role: 'agent', text: '', streaming: true })
      }

      if (msg.type === 'agent_chunk') {
        characterState.value = 'talking'
        const m = messages.value.find(m => m.id === currentAgentMessageId)
        if (m) m.text += msg.text
      }

      if (msg.type === 'agent_done') {
        characterState.value = 'idle'
        const m = messages.value.find(m => m.id === currentAgentMessageId)
        if (m) m.streaming = false
        currentAgentMessageId = null
      }

      if (msg.type === 'error') {
        characterState.value = 'idle'
        console.error('WS error:', msg.message)
      }
    }

    ws.onclose = () => {
      connected.value = false
      setTimeout(connect, 2000) // reconnect
    }
  }

  function sendMessage(text: string) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    messages.value.push({ id: crypto.randomUUID(), role: 'user', text })
    ws.send(JSON.stringify({ type: 'user_message', text }))
  }

  connect()
  onUnmounted(() => ws?.close())

  return { messages, characterState, sessionId, connected, sendMessage }
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/claude/vibe-studying
git add frontend/src/composables/useWebSocket.ts
git commit -m "feat: add useWebSocket composable with streaming and character state"
```

---

## Task 8: useVrm composable (frontend)

**Files:**
- Create: `frontend/src/composables/useVrm.ts`

- [ ] **Step 1: Write useVrm.ts**

Create `frontend/src/composables/useVrm.ts`:
```ts
import { ref, watch } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import type { VRM } from '@pixiv/three-vrm'
import type { CharacterState } from './useWebSocket'

export function useVrm(characterState: ReturnType<typeof ref<CharacterState>>) {
  const vrmRef = ref<VRM | null>(null)
  let clock = new THREE.Clock()
  let blinkTimer = 0
  let blinkInterval = randomBlinkInterval()

  function randomBlinkInterval() {
    return 2 + Math.random() * 3 // 2-5 seconds
  }

  async function loadVrm(url: string, scene: THREE.Scene): Promise<VRM> {
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))

    const gltf = await loader.loadAsync(url)
    const vrm: VRM = gltf.userData.vrm

    VRMUtils.removeUnnecessaryVertices(gltf.scene)
    VRMUtils.removeUnnecessaryJoints(gltf.scene)

    vrm.scene.rotation.y = Math.PI
    scene.add(vrm.scene)
    vrmRef.value = vrm
    return vrm
  }

  function update() {
    const vrm = vrmRef.value
    if (!vrm) return

    const delta = clock.getDelta()
    vrm.update(delta)

    // Auto-blink
    blinkTimer += delta
    if (blinkTimer >= blinkInterval) {
      blink(vrm)
      blinkTimer = 0
      blinkInterval = randomBlinkInterval()
    }

    // Talking jaw movement
    const state = characterState.value
    if (vrm.expressionManager) {
      const jawTarget = state === 'talking' ? 0.3 + Math.sin(Date.now() / 100) * 0.2 : 0
      vrm.expressionManager.setValue('aa', Math.max(0, jawTarget))
    }
  }

  function blink(vrm: VRM) {
    if (!vrm.expressionManager) return
    vrm.expressionManager.setValue('blink', 1)
    setTimeout(() => {
      if (vrm.expressionManager) vrm.expressionManager.setValue('blink', 0)
    }, 150)
  }

  return { vrmRef, loadVrm, update }
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/claude/vibe-studying
git add frontend/src/composables/useVrm.ts
git commit -m "feat: add useVrm composable with auto-blink and talking animation"
```

---

## Task 9: VrmViewer component (frontend)

**Files:**
- Create: `frontend/src/components/VrmViewer.vue`

- [ ] **Step 1: Write VrmViewer.vue**

Create `frontend/src/components/VrmViewer.vue`:
```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { useVrm } from '../composables/useVrm'
import type { CharacterState } from '../composables/useWebSocket'

const props = defineProps<{
  vrmUrl: string
  characterState: CharacterState
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const characterStateRef = ref(props.characterState)

watch(() => props.characterState, (v) => { characterStateRef.value = v })

const { loadVrm, update } = useVrm(characterStateRef)

let renderer: THREE.WebGLRenderer
let animFrameId: number

onMounted(async () => {
  const canvas = canvasRef.value!
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(canvas.clientWidth, canvas.clientHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(30, canvas.clientWidth / canvas.clientHeight, 0.1, 20)
  camera.position.set(0, 1.3, 3)

  const light = new THREE.DirectionalLight(0xffffff, 1)
  light.position.set(1, 1, 1)
  scene.add(light)
  scene.add(new THREE.AmbientLight(0xffffff, 0.5))

  await loadVrm(props.vrmUrl, scene)

  function animate() {
    animFrameId = requestAnimationFrame(animate)
    update()
    renderer.render(scene, camera)
  }
  animate()
})

onUnmounted(() => {
  cancelAnimationFrame(animFrameId)
  renderer?.dispose()
})
</script>

<template>
  <canvas ref="canvasRef" class="w-full h-full" />
</template>
```

- [ ] **Step 2: Commit**

```bash
cd /home/claude/vibe-studying
git add frontend/src/components/VrmViewer.vue
git commit -m "feat: add VrmViewer component with Three.js scene setup"
```

---

## Task 10: Chat UI components (frontend)

**Files:**
- Create: `frontend/src/components/ChatBubble.vue`
- Create: `frontend/src/components/ChatInput.vue`

- [ ] **Step 1: Write ChatBubble.vue**

Create `frontend/src/components/ChatBubble.vue`:
```vue
<script setup lang="ts">
import type { Message } from '../composables/useWebSocket'

defineProps<{ message: Message }>()
</script>

<template>
  <div
    class="max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed"
    :class="message.role === 'user'
      ? 'ml-auto bg-blue-500 text-white'
      : 'mr-auto bg-white/90 text-gray-800 shadow'"
  >
    <span>{{ message.text }}</span>
    <span v-if="message.streaming" class="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
  </div>
</template>
```

- [ ] **Step 2: Write ChatInput.vue**

Create `frontend/src/components/ChatInput.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ send: [text: string] }>()
const props = defineProps<{ disabled: boolean }>()

const input = ref('')

function submit() {
  const text = input.value.trim()
  if (!text || props.disabled) return
  emit('send', text)
  input.value = ''
}
</script>

<template>
  <div class="flex gap-2 p-4 bg-white/80 backdrop-blur border-t border-gray-200">
    <input
      v-model="input"
      class="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-400"
      placeholder="Ask the agent to write some code..."
      :disabled="disabled"
      @keydown.enter="submit"
    />
    <button
      class="rounded-xl bg-blue-500 px-4 py-2 text-sm text-white disabled:opacity-40"
      :disabled="disabled"
      @click="submit"
    >
      Send
    </button>
  </div>
</template>
```

- [ ] **Step 3: Commit**

```bash
cd /home/claude/vibe-studying
git add frontend/src/components/ChatBubble.vue frontend/src/components/ChatInput.vue
git commit -m "feat: add ChatBubble and ChatInput components"
```

---

## Task 11: App.vue — wire everything together

**Files:**
- Modify: `frontend/src/App.vue`
- Modify: `frontend/src/main.ts`
- Create: `frontend/index.html`

- [ ] **Step 1: Write App.vue**

Replace `frontend/src/App.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue'
import VrmViewer from './components/VrmViewer.vue'
import ChatBubble from './components/ChatBubble.vue'
import ChatInput from './components/ChatInput.vue'
import { useWebSocket } from './composables/useWebSocket'

// Replace with a real .vrm URL or host locally
const VRM_URL = '/model.vrm'

const { messages, characterState, connected, sendMessage } = useWebSocket()

const isAgentBusy = computed(() =>
  characterState.value === 'thinking' || characterState.value === 'talking'
)
</script>

<template>
  <div class="flex h-screen w-screen bg-gradient-to-br from-indigo-100 to-purple-100">
    <!-- Left: 3D character -->
    <div class="flex-1 relative">
      <VrmViewer :vrm-url="VRM_URL" :character-state="characterState" />
      <!-- State badge -->
      <div class="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-white/80 bg-black/30 px-3 py-1 rounded-full">
        {{ characterState }}
      </div>
    </div>

    <!-- Right: Chat panel -->
    <div class="w-[380px] flex flex-col bg-white/40 backdrop-blur-md border-l border-white/50">
      <!-- Connection status -->
      <div class="px-4 py-2 text-xs text-center" :class="connected ? 'text-green-600' : 'text-red-500'">
        {{ connected ? 'Connected' : 'Connecting...' }}
      </div>

      <!-- Messages -->
      <div class="flex-1 overflow-y-auto flex flex-col gap-3 p-4">
        <ChatBubble v-for="msg in messages" :key="msg.id" :message="msg" />
      </div>

      <!-- Input -->
      <ChatInput :disabled="!connected || isAgentBusy" @send="sendMessage" />
    </div>
  </div>
</template>
```

- [ ] **Step 2: Update main.ts**

Replace `frontend/src/main.ts`:
```ts
import { createApp } from 'vue'
import 'virtual:uno.css'
import App from './App.vue'

createApp(App).mount('#app')
```

- [ ] **Step 3: Commit**

```bash
cd /home/claude/vibe-studying
git add frontend/src/App.vue frontend/src/main.ts
git commit -m "feat: wire up App.vue with VRM viewer and chat panel"
```

---

## Task 12: docker-compose.yml + VRM model

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Write docker-compose.yml**

Create `docker-compose.yml`:
```yaml
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    volumes:
      - ./data:/app/data
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on: []

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "5173:5173"
```

- [ ] **Step 2: Write backend Dockerfile**

Create `backend/Dockerfile`:
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc
CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: Write frontend Dockerfile**

Create `frontend/Dockerfile`:
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npx", "vite", "--host"]
```

- [ ] **Step 4: Write .env.example**

Create `.env.example`:
```
ANTHROPIC_API_KEY=your_key_here
```

- [ ] **Step 5: Add a free VRM model**

Download a free VRM model for testing (AvatarSample_A from VRoid Hub samples):
```bash
cd /home/claude/vibe-studying/frontend/public
curl -L "https://github.com/pixiv/three-vrm/raw/dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm" \
  -o model.vrm
```

If that URL fails, any `.vrm` file placed at `frontend/public/model.vrm` will work.

- [ ] **Step 6: Update .gitignore**

Create/update `.gitignore`:
```
node_modules/
dist/
data/*.db
.env
*.vrm
```

- [ ] **Step 7: Commit**

```bash
cd /home/claude/vibe-studying
git add docker-compose.yml backend/Dockerfile frontend/Dockerfile .env.example .gitignore
git commit -m "feat: add docker-compose and Dockerfiles for full stack"
```

---

## Task 13: End-to-end smoke test

- [ ] **Step 1: Build the agent image**

```bash
cd /home/claude/vibe-studying/agent
docker build -t vibe-studying-agent .
```

Expected: `Successfully built ...`

- [ ] **Step 2: Start the backend**

```bash
cd /home/claude/vibe-studying/backend
ANTHROPIC_API_KEY=your_key npm run dev
```

Expected: `WebSocket server running on ws://localhost:3001`

- [ ] **Step 3: Start the frontend**

```bash
cd /home/claude/vibe-studying/frontend
npm run dev
```

Expected: `VITE ... ready at http://localhost:5173`

- [ ] **Step 4: Manual browser test**

Open `http://localhost:5173` in a browser.

Verify:
1. 3D character loads and shows idle animation
2. Status badge shows "Connected"
3. Type "Write a Python function that adds two numbers and test it" → Send
4. Character switches to "thinking" state
5. Character switches to "talking" as text streams in
6. Code appears in chat bubble progressively
7. Character returns to "idle" when done

- [ ] **Step 5: Final commit and push**

```bash
cd /home/claude/vibe-studying
git add .
git commit -m "chore: finalize smoke test instructions and push"
git push origin master
```

---

## Self-Review Notes

- **Spec coverage:** All 6 architecture layers covered (frontend, WS, queue, container runner, agent, db). Voice/lip-sync explicitly out of scope per spec.
- **Type consistency:** `CharacterState` defined in `useWebSocket.ts`, imported in `useVrm.ts` and `VrmViewer.vue`. `Message` type flows from composable → `ChatBubble` prop.
- **Streaming sentinels:** `---STREAM_START---` / `---STREAM_END---` markers used consistently in agent stdout and container-runner parser.
- **Session persistence:** `sessionStorage` used in browser so session survives page refresh but not new tab (matches spec: no cross-session persistence required).
- **VRM model:** Task 12 downloads a sample model. Production deployments need a real model asset.
