import type { Message } from '@shared/types'

const BASE = 'http://localhost:11434'

// Streaming draft — calls onToken for each partial token.
// The AbortSignal lets the caller cancel mid-stream (e.g. user closes dialog).
export async function generateDraft(args: {
  context: string
  onToken: (token: string) => void
  signal?: AbortSignal
}): Promise<string> {
  const model = process.env.SIGNALX_OLLAMA_MODEL ?? 'qwen2.5:7b-instruct'

  const res = await fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: args.context, stream: true }),
    signal: args.signal
  })

  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`)
  if (!res.body) throw new Error('Ollama returned no body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    for (const line of decoder.decode(value).split('\n')) {
      if (!line.trim()) continue
      try {
        const chunk = JSON.parse(line) as { response: string; done: boolean }
        args.onToken(chunk.response)
        full += chunk.response
        if (chunk.done) return full
      } catch {
        // Partial line — will be completed in next chunk
      }
    }
  }

  return full
}

// Non-streaming summarize — simpler, used for thread summaries.
export async function summarize(messages: Message[]): Promise<string> {
  const model = process.env.SIGNALX_OLLAMA_MODEL ?? 'qwen2.5:7b-instruct'
  const transcript = messages
    .map((m) => `${m.isAutomated ? 'Business' : 'Customer'}: ${m.content}`)
    .join('\n')

  const res = await fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: `Summarize this business conversation in 2-3 sentences:\n\n${transcript}`,
      stream: false
    })
  })

  if (!res.ok) throw new Error(`Ollama error ${res.status}`)
  const json = (await res.json()) as { response: string }
  return json.response
}
