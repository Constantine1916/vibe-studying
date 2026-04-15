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
