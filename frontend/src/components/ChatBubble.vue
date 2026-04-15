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
