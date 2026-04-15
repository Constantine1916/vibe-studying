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
