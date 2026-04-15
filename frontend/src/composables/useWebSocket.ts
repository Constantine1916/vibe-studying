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
