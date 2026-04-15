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
