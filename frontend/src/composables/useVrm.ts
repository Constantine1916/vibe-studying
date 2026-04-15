import { ref, Ref } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import type { VRM } from '@pixiv/three-vrm'
import type { CharacterState } from './useWebSocket'

export function useVrm(characterState: Ref<CharacterState>) {
  const vrmRef = ref<VRM | null>(null)
  const clock = new THREE.Clock()
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
