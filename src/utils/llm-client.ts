import OpenAI from 'openai';
import { loadConfig } from './config.js';

export interface LLMResponse {
  content: string;
}

export interface LLMConfig {
  model: string;
  maxTokens: number;
  temperature?: number;
}

/**
 * Centralized OpenAI client configuration and management
 */
export class LLMClient {
  private client: OpenAI;
  private config: ReturnType<typeof loadConfig>;

  constructor() {
    this.config = loadConfig();

    // Prioritize OpenAI configuration, fall back to Anthropic key if available
    const apiKey =
      this.config.openaiApiKey ||
      process.env.OPENAI_API_KEY ||
      this.config.apiKey ||
      process.env.ANTHROPIC_API_KEY;

    const baseURL = this.config.baseUrl || process.env.OPENAI_BASE_URL;

    if (!apiKey) {
      throw new Error(
        'API key is required. Set openaiApiKey/OPENAI_API_KEY or apiKey/ANTHROPIC_API_KEY in config or environment'
      );
    }

    this.client = new OpenAI({
      apiKey,
      baseURL,
    });
  }

  /**
   * Get the configured model name
   */
  getModel(): string {
    return this.config.model;
  }

  /**
   * Check if client is properly configured
   */
  isConfigured(): boolean {
    return !!(
      this.config.openaiApiKey ||
      process.env.OPENAI_API_KEY ||
      this.config.apiKey ||
      process.env.ANTHROPIC_API_KEY
    );
  }

  /**
   * Make a structured chat completion request
   */
  async chatCompletion(
    systemPrompt: string,
    userPrompt: string,
    llmConfig: LLMConfig,
    jsonSchema?: any
  ): Promise<LLMResponse> {
    try {
      const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParams =
        {
          model: llmConfig.model || this.getModel(),
          max_completion_tokens: llmConfig.maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        };

      if (
        llmConfig.temperature !== undefined &&
        llmConfig.temperature !== 1.0
      ) {
        requestOptions.temperature = llmConfig.temperature;
      }

      if (jsonSchema) {
        requestOptions.response_format = {
          type: 'json_schema',
          json_schema: jsonSchema,
        };
      }

      const response =
        await this.client.chat.completions.create(requestOptions);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content from OpenAI API');
      }

      return { content };
    } catch (error) {
      throw new Error(`Failed to query OpenAI API: ${error}`);
    }
  }

  /**
   * Parse JSON response with error handling
   */
  parseJsonResponse<T>(content: string, schema: any): T {
    try {
      // Clean up potential markdown code blocks
      let cleanContent = content.trim();
      if (cleanContent.includes('```json')) {
        const jsonMatch = cleanContent.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          cleanContent = jsonMatch[1];
        }
      }

      const jsonData = JSON.parse(cleanContent);
      return schema.parse(jsonData);
    } catch (error) {
      throw new Error(
        `Failed to parse JSON response: ${error}\nContent: ${content}`
      );
    }
  }
}

/**
 * Get a singleton LLM client instance
 */
let clientInstance: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (!clientInstance) {
    clientInstance = new LLMClient();
  }
  return clientInstance;
}

/**
 * Check if LLM client can be configured
 */
export function canConfigureLLMClient(): boolean {
  const config = loadConfig();
  return !!(
    config.openaiApiKey ||
    process.env.OPENAI_API_KEY ||
    config.apiKey ||
    process.env.ANTHROPIC_API_KEY
  );
}
