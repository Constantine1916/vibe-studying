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
