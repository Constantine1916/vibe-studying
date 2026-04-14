import Anthropic from '@anthropic-ai/sdk'

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

  const stream = client.beta.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 8096,
    system: `You are a helpful coding agent. You can write, run, and explain code.
When asked to write code, write it and then run it using the Bash tool to show the result.
Be concise and friendly.`,
    messages: [{ role: 'user', content: input.message }],
    tools: [
      { type: 'bash_20250124' as const, name: 'bash' as const },
      { type: 'text_editor_20250124' as const, name: 'str_replace_based_edit_tool' as const },
    ] as any,
    betas: ['computer-use-2025-01-24'],
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
