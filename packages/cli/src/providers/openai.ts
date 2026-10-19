import type { ProviderAdapter, ProviderCallParams, ProviderResponse } from './types.js';

export class OpenAIAdapter implements ProviderAdapter {
  async call(params: ProviderCallParams): Promise<ProviderResponse> {
    const baseUrl = (params.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const endpoint = `${baseUrl}/chat/completions`;

    const messages: { role: string; content: string }[] = [];
    if (params.systemPrompt) {
      messages.push({ role: 'system', content: params.systemPrompt });
    }
    messages.push({ role: 'user', content: params.userPrompt });

    // Monta o payload de requisição
    const requestBody: Record<string, unknown> = {
      model: params.model,
      messages,
      temperature: params.temperature,
    };

    if (params.maxTokens) {
      requestBody.max_tokens = params.maxTokens;
    }

    if (params.responseFormat === 'json_object') {
      requestBody.response_format = { type: 'json_object' };
    } else if (params.responseFormat === 'json_schema' && params.jsonSchema) {
      requestBody.response_format = {
        type: 'json_schema',
        json_schema: {
          name: params.contractSlug.replace(/[^a-zA-Z0-9_-]/g, '_'),
          schema: params.jsonSchema,
          strict: true,
        },
      };
    }

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= params.retries) {
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), params.timeoutMs);
      const startTime = performance.now();

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${params.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutTimer);
        const latencyMs = Math.round(performance.now() - startTime);

        if (response.ok) {
          const data = (await response.json()) as {
            choices?: { message?: { content?: string } }[];
            system_fingerprint?: string | null;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };

          const rawContent = data.choices?.[0]?.message?.content || '';
          const systemFingerprint = data.system_fingerprint || null;
          const inputTokens = data.usage?.prompt_tokens || 0;
          const outputTokens = data.usage?.completion_tokens || 0;

          return {
            rawContent,
            systemFingerprint,
            latencyMs,
            inputTokens,
            outputTokens,
          };
        }

        // Erros tratáveis com retry (429 Rate Limit ou 5xx Server Error)
        if (response.status === 429 || response.status >= 500) {
          const errorText = await response.text();
          lastError = new Error(`Provedor retornou status ${response.status}: ${errorText}`);

          if (attempt < params.retries) {
            attempt++;
            const backoffMs = Math.min(500 * 2 ** (attempt - 1), 5000);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }
        }

        const errorText = await response.text();
        throw new Error(`Provedor retornou erro HTTP ${response.status}: ${errorText}`);
      } catch (err) {
        clearTimeout(timeoutTimer);
        const isAbort = err instanceof Error && err.name === 'AbortError';
        lastError = isAbort
          ? new Error(`Timeout da requisição excedeu ${params.timeoutMs}ms`)
          : (err as Error);

        if (attempt < params.retries) {
          attempt++;
          const backoffMs = Math.min(500 * 2 ** (attempt - 1), 5000);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        break;
      }
    }

    throw lastError || new Error('Falha desconhecida na chamada ao provedor de IA');
  }
}
