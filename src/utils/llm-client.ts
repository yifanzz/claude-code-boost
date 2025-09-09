import OpenAI from 'openai';
import { loadConfig } from './config.js';
import type { AuthMethod } from '../types/hook-schemas.js';

export interface LLMResponse {
  content: string;
}

export interface LLMConfig {
  model: string;
  maxTokens: number;
  temperature?: number;
}

/**
 * Centralized LLM client that supports multiple authentication methods
 */
export class LLMClient {
  private openaiClient: OpenAI | null = null;
  private config: ReturnType<typeof loadConfig>;
  private authMethod: AuthMethod;

  constructor() {
    this.config = loadConfig();
    this.authMethod = this.determineAuthMethod();

    if (
      this.authMethod === 'beyondthehype' ||
      this.authMethod === 'openai-compatible' ||
      this.authMethod === 'anthropic-compatible'
    ) {
      this.initializeOpenAIClient();
    }
  }

  private determineAuthMethod(): AuthMethod {
    // If explicitly set in config, use that
    if (this.config.authMethod) {
      return this.config.authMethod;
    }

    // Auto-detect based on available credentials
    // Priority: beyondthehype > openai > anthropic
    if (this.config.beyondthehypeApiKey) {
      return 'beyondthehype';
    } else if (this.config.openaiApiKey || process.env.OPENAI_API_KEY) {
      return 'openai-compatible';
    } else if (
      this.config.anthropicApiKey ||
      this.config.apiKey ||
      process.env.ANTHROPIC_API_KEY
    ) {
      return 'anthropic-compatible';
    } else {
      throw new Error(
        'No authentication method available. Please configure an API key.'
      );
    }
  }

  private initializeOpenAIClient(): void {
    let apiKey = '';
    let baseURL: string | undefined;

    if (this.authMethod === 'beyondthehype') {
      apiKey = this.config.beyondthehypeApiKey || '';
      baseURL = 'https://litellm.yifan.dev/v1/';

      if (!apiKey) {
        throw new Error(
          'beyondthehypeApiKey is required for beyondthehype auth method'
        );
      }
    } else if (this.authMethod === 'openai-compatible') {
      apiKey = this.config.openaiApiKey || process.env.OPENAI_API_KEY || '';
      baseURL = this.config.baseUrl || process.env.OPENAI_BASE_URL;

      if (!apiKey) {
        throw new Error(
          'API key is required. Set openaiApiKey/OPENAI_API_KEY in config or environment'
        );
      }
    } else if (this.authMethod === 'anthropic-compatible') {
      // Use Anthropic API with OpenAI SDK
      apiKey =
        this.config.anthropicApiKey ||
        this.config.apiKey ||
        process.env.ANTHROPIC_API_KEY ||
        '';
      baseURL = 'https://api.anthropic.com/v1';

      if (!apiKey) {
        throw new Error(
          'API key is required. Set anthropicApiKey/apiKey/ANTHROPIC_API_KEY in config or environment'
        );
      }
    } else {
      throw new Error(`Unsupported auth method: ${this.authMethod}`);
    }

    this.openaiClient = new OpenAI({
      apiKey,
      baseURL,
    });
  }

  /**
   * Get the configured model name
   */
  getModel(): string {
    if (this.authMethod === 'beyondthehype') {
      return 'gpt-5-mini'; // Your API proxy model
    } else if (this.authMethod === 'anthropic-compatible') {
      return 'claude-3-5-sonnet-20241022'; // Default Anthropic model
    } else if (this.authMethod === 'openai-compatible') {
      return 'gpt-5-mini'; // Default OpenAI model
    }
    return this.config.model;
  }

  /**
   * Get the current authentication method
   */
  getAuthMethod(): AuthMethod {
    return this.authMethod;
  }

  /**
   * Check if client is properly configured
   */
  isConfigured(): boolean {
    switch (this.authMethod) {
      case 'beyondthehype':
        return !!this.config.beyondthehypeApiKey;
      case 'openai-compatible':
        return !!(this.config.openaiApiKey || process.env.OPENAI_API_KEY);
      case 'anthropic-compatible':
        return !!(
          this.config.anthropicApiKey ||
          this.config.apiKey ||
          process.env.ANTHROPIC_API_KEY
        );
      default:
        return false;
    }
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
    // For OpenAI-compatible APIs (including beyondthehype)
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

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

      // Handle structured output based on provider
      if (jsonSchema) {
        if (this.authMethod === 'anthropic-compatible') {
          // Anthropic doesn't support json_schema in their OpenAI-compatible endpoint
          // Add JSON schema instructions to the system prompt instead
          requestOptions.messages[0].content += `\n\nPlease respond with valid JSON that matches this schema:\n${JSON.stringify(jsonSchema.schema, null, 2)}`;
        } else {
          requestOptions.response_format = {
            type: 'json_schema',
            json_schema: jsonSchema,
          };
        }
      }

      const response =
        await this.openaiClient.chat.completions.create(requestOptions);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error(
          'No response content from API, got response: ' +
            JSON.stringify(response.choices)
        );
      }

      return { content };
    } catch (error) {
      throw new Error(`Failed to query API: ${error}`);
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
  try {
    const config = loadConfig();

    // Check if any authentication method is available
    return !!(
      config.beyondthehypeApiKey ||
      config.openaiApiKey ||
      process.env.OPENAI_API_KEY ||
      config.anthropicApiKey ||
      config.apiKey ||
      process.env.ANTHROPIC_API_KEY
    );
  } catch {
    return false;
  }
}
