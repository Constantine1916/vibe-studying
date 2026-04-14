import Docker from 'dockerode'

const docker = new Docker()
const IMAGE_NAME = 'vibe-studying-agent'

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

  const stream = await container.attach({ stream: true, stdin: true, stdout: true, stderr: true })
  stream.write(input)
  stream.end()

  let buffer = ''
  let streaming = false
  let settled = false

  function settle(fn: () => void) {
    if (settled) return
    settled = true
    fn()
  }

  await new Promise<void>((resolve) => {
    container.modem.demuxStream(
      stream,
      // stdout
      {
        write(chunk: Buffer) {
          buffer += chunk.toString()

          if (!streaming && buffer.includes('---STREAM_START---\n')) {
            streaming = true
            buffer = buffer.split('---STREAM_START---\n')[1] ?? ''
          }

          if (streaming) {
            const endIdx = buffer.indexOf('\n---STREAM_END---')
            if (endIdx !== -1) {
              const finalText = buffer.slice(0, endIdx)
              if (finalText) onChunk(finalText)
              settle(onDone)
              buffer = ''
              streaming = false
            } else {
              onChunk(buffer)
              buffer = ''
            }
          }
        },
      },
      // stderr
      {
        write(chunk: Buffer) {
          process.stderr.write(`[container ${sessionId}] ${chunk.toString()}`)
        },
      },
    )

    stream.on('end', () => {
      settle(onDone)
      resolve()
    })

    stream.on('error', (err: Error) => {
      settle(() => onError(err))
      resolve()
    })
  })

  const result = await container.wait()
  await container.remove()

  if (result.StatusCode !== 0 && !settled) {
    onError(new Error(`Container exited with code ${result.StatusCode}`))
  }
}
