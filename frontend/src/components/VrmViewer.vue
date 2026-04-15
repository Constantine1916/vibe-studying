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
let animFrameId = 0

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
