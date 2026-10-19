import { describe, expect, it } from 'vitest';
import { validateApiUrlSecurity } from '../src/config/loader.js';
import { PromptCheckConfigSchema } from '../src/config/schema.js';

describe('CLI Config Validation & Security', () => {
  it('validates a complete valid promptcheck.yaml structure', () => {
    const validConfig = {
      version: 1,
      project: 'extrator-nf',
      api_url: 'https://api.promptcheck.techtinker.com.br',
      defaults: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0.0,
        response_format: 'json_object',
        concurrency: 5,
        fail_under: 100,
        timeout_ms: 30000,
        retries: 3,
      },
      contracts: [
        {
          slug: 'extrator-nota-fiscal',
          prompt_file: './prompts/nf.txt',
          model: 'gpt-4o-mini',
        },
      ],
    };

    const parse = PromptCheckConfigSchema.safeParse(validConfig);
    expect(parse.success).toBe(true);
  });

  it('enforces HTTPS for remote api_url', () => {
    expect(() => {
      validateApiUrlSecurity('http://insecure.api.com');
    }).toThrow(/HTTPS/i);

    expect(() => {
      validateApiUrlSecurity('https://api.promptcheck.techtinker.com.br');
    }).not.toThrow();
  });

  it('allows HTTP exclusively for localhost in development', () => {
    expect(() => {
      validateApiUrlSecurity('http://localhost:3333');
    }).not.toThrow();

    expect(() => {
      validateApiUrlSecurity('http://127.0.0.1:3333');
    }).not.toThrow();
  });
});
