import { cleanJsonText, text } from '../utils.mjs';

export function getAnthropicKey() {
  return (
    process.env.ANTHROPIC_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.CLAUDE_API_KEY ||
    ''
  );
}

export async function callAnthropicJson(messages, maxTokens = 1900) {
  const key = getAnthropicKey();
  if (!key) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 26000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        messages
      }),
      signal: controller.signal
    });

    const raw = await response.text();
    if (!response.ok) return null;

    const data = JSON.parse(raw || '{}');
    const content = data?.content?.[0]?.text || '';
    return JSON.parse(cleanJsonText(content));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
