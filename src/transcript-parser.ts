import { readFileSync } from 'fs';
import { log } from './utils/general-logger.js';

export interface Message {
  role: 'user' | 'assistant' | 'user_command';
  content: string;
}

interface ConversationEntry {
  type: string;
  message?: {
    role: 'user' | 'assistant';
    content:
      | string
      | Array<{
          type: 'text' | 'tool_use' | 'tool_result';
          text?: string;
          content?: string;
        }>;
  };
}

export function extractTextMessages(jsonlPath: string): Message[] {
  const fileContent = readFileSync(jsonlPath, 'utf8');
  const lines = fileContent.trim().split('\n');
  const messages: Message[] = [];

  for (const line of lines) {
    try {
      const entry: ConversationEntry = JSON.parse(line);

      // Skip non-message entries (like summaries)
      if (!entry.message || entry.type === 'summary') {
        continue;
      }

      const { role, content } = entry.message;

      if (!role || !content) {
        continue;
      }

      // Handle string content (user messages)
      if (typeof content === 'string') {
        const messageRole =
          role === 'user' && isUserCommand(content) ? 'user_command' : role;
        messages.push({ role: messageRole, content });
        continue;
      }

      // Handle array content (both user and assistant messages)
      if (Array.isArray(content)) {
        // For user messages with array content, only include if they contain actual user text
        if (role === 'user') {
          // Skip user messages that only contain tool results or non-text content
          const hasUserText = content.some(
            (part) =>
              part.type === 'text' && part.text && part.text.trim() !== ''
          );
          if (!hasUserText) {
            continue;
          }

          // Extract only text parts from user messages
          const textParts: string[] = [];
          for (const part of content) {
            if (part.type === 'text' && part.text) {
              textParts.push(part.text);
            }
          }

          if (textParts.length > 0) {
            const combinedContent = textParts.join('\n\n');
            const messageRole = isUserCommand(combinedContent)
              ? 'user_command'
              : role;
            messages.push({ role: messageRole, content: combinedContent });
          }
          continue;
        }
        const textParts: string[] = [];

        for (const part of content) {
          if (part.type === 'text' && part.text) {
            textParts.push(part.text);
          } else if (part.type === 'tool_result' && part.content) {
            // Include tool results as they might contain relevant text
            textParts.push(`[Tool Result: ${part.content}]`);
          }
        }

        if (textParts.length > 0) {
          messages.push({ role, content: textParts.join('\n\n') });
        }
      }
    } catch (error) {
      // Skip invalid JSON lines
      log.warn({}, `skipping invalid JSON lines due to ${error}`);
      continue;
    }
  }

  return messages;
}

export function convertToXml(messages: Message[]): string {
  const xmlParts = ['<Messages>'];

  for (const message of messages) {
    let tagName: string;
    if (message.role === 'user') {
      tagName = 'UserMessage';
    } else if (message.role === 'user_command') {
      tagName = 'UserCommand';
    } else {
      tagName = 'AssistantMessage';
    }
    const escapedContent = escapeXml(message.content);
    xmlParts.push(`<${tagName}>${escapedContent}</${tagName}>`);
  }

  xmlParts.push('</Messages>');
  return xmlParts.join('\n');
}

function isUserCommand(content: string): boolean {
  const trimmedContent = content.trim();

  // Check for "Caveat:" messages
  if (trimmedContent.startsWith('Caveat:')) {
    return true;
  }

  // Check for XML-formatted command messages
  if (
    trimmedContent.startsWith('<command-name>') ||
    trimmedContent.startsWith('&lt;command-name&gt;')
  ) {
    return true;
  }

  // Check for local command output messages
  if (
    trimmedContent.startsWith('<local-command-') ||
    trimmedContent.startsWith('&lt;local-command-')
  ) {
    return true;
  }

  // Check for other command-like patterns
  if (
    /^<[a-zA-Z-]+>/.test(trimmedContent) &&
    trimmedContent.includes('<') &&
    trimmedContent.includes('>')
  ) {
    return true;
  }

  return false;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
