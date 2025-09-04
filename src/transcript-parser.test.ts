import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'fs';
import { extractTextMessages, convertToXml } from './transcript-parser.js';

describe('extractTextMessages', () => {
  const testFilePath = '/tmp/test-transcript.jsonl';

  afterEach(() => {
    try {
      unlinkSync(testFilePath);
    } catch {
      // File may not exist
    }
  });

  it('should extract user and assistant messages', () => {
    const testData = [
      {
        type: 'user',
        message: {
          role: 'user',
          content: 'Hello, how are you?',
        },
      },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'I am doing well, thank you!',
            },
          ],
        },
      },
    ];

    const jsonlContent = testData
      .map((entry) => JSON.stringify(entry))
      .join('\n');
    writeFileSync(testFilePath, jsonlContent);

    const messages = extractTextMessages(testFilePath);

    expect(messages).toEqual([
      { role: 'user', content: 'Hello, how are you?' },
      { role: 'assistant', content: 'I am doing well, thank you!' },
    ]);
  });

  it('should skip summary entries', () => {
    const testData = [
      {
        type: 'summary',
        summary: 'Some conversation summary',
      },
      {
        type: 'user',
        message: {
          role: 'user',
          content: 'Test message',
        },
      },
    ];

    const jsonlContent = testData
      .map((entry) => JSON.stringify(entry))
      .join('\n');
    writeFileSync(testFilePath, jsonlContent);

    const messages = extractTextMessages(testFilePath);

    expect(messages).toEqual([{ role: 'user', content: 'Test message' }]);
  });

  it('should handle assistant messages with multiple text parts', () => {
    const testData = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'First part',
            },
            {
              type: 'text',
              text: 'Second part',
            },
          ],
        },
      },
    ];

    const jsonlContent = testData
      .map((entry) => JSON.stringify(entry))
      .join('\n');
    writeFileSync(testFilePath, jsonlContent);

    const messages = extractTextMessages(testFilePath);

    expect(messages).toEqual([
      { role: 'assistant', content: 'First part\n\nSecond part' },
    ]);
  });

  it('should include tool results in assistant messages', () => {
    const testData = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Let me check that for you.',
            },
            {
              type: 'tool_result',
              content: 'File contents here',
            },
          ],
        },
      },
    ];

    const jsonlContent = testData
      .map((entry) => JSON.stringify(entry))
      .join('\n');
    writeFileSync(testFilePath, jsonlContent);

    const messages = extractTextMessages(testFilePath);

    expect(messages).toEqual([
      {
        role: 'assistant',
        content:
          'Let me check that for you.\n\n[Tool Result: File contents here]',
      },
    ]);
  });

  it('should skip invalid JSON lines', () => {
    const testContent =
      '{"type":"user","message":{"role":"user","content":"Valid message"}}\ninvalid json line\n{"type":"user","message":{"role":"user","content":"Another valid message"}}';
    writeFileSync(testFilePath, testContent);

    const messages = extractTextMessages(testFilePath);

    expect(messages).toEqual([
      { role: 'user', content: 'Valid message' },
      { role: 'user', content: 'Another valid message' },
    ]);
  });

  it('should skip entries without message field', () => {
    const testData = [
      {
        type: 'user',
        someOtherField: 'value',
      },
      {
        type: 'user',
        message: {
          role: 'user',
          content: 'Valid message',
        },
      },
    ];

    const jsonlContent = testData
      .map((entry) => JSON.stringify(entry))
      .join('\n');
    writeFileSync(testFilePath, jsonlContent);

    const messages = extractTextMessages(testFilePath);

    expect(messages).toEqual([{ role: 'user', content: 'Valid message' }]);
  });

  it('should handle empty assistant content arrays', () => {
    const testData = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [],
        },
      },
      {
        type: 'user',
        message: {
          role: 'user',
          content: 'Test message',
        },
      },
    ];

    const jsonlContent = testData
      .map((entry) => JSON.stringify(entry))
      .join('\n');
    writeFileSync(testFilePath, jsonlContent);

    const messages = extractTextMessages(testFilePath);

    expect(messages).toEqual([{ role: 'user', content: 'Test message' }]);
  });

  it('should filter out user messages with only tool results', () => {
    const testData = [
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              content: 'Some tool output',
            },
          ],
        },
      },
      {
        type: 'user',
        message: {
          role: 'user',
          content: 'Actual user message',
        },
      },
    ];

    const jsonlContent = testData
      .map((entry) => JSON.stringify(entry))
      .join('\n');
    writeFileSync(testFilePath, jsonlContent);

    const messages = extractTextMessages(testFilePath);

    expect(messages).toEqual([
      { role: 'user', content: 'Actual user message' },
    ]);
  });

  it('should include user messages with text content from arrays', () => {
    const testData = [
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'User message in array format',
            },
            {
              type: 'tool_result',
              content: 'Tool output (should be ignored)',
            },
          ],
        },
      },
    ];

    const jsonlContent = testData
      .map((entry) => JSON.stringify(entry))
      .join('\n');
    writeFileSync(testFilePath, jsonlContent);

    const messages = extractTextMessages(testFilePath);

    expect(messages).toEqual([
      { role: 'user', content: 'User message in array format' },
    ]);
  });
});

describe('convertToXml', () => {
  it('should convert messages to XML format', () => {
    const messages = [
      { role: 'user' as const, content: 'Hello, how are you?' },
      { role: 'assistant' as const, content: 'I am doing well, thank you!' },
      { role: 'user' as const, content: "That's great to hear." },
    ];

    const xml = convertToXml(messages);

    expect(xml).toBe(`<Messages>
<UserMessage>Hello, how are you?</UserMessage>
<AssistantMessage>I am doing well, thank you!</AssistantMessage>
<UserMessage>That&apos;s great to hear.</UserMessage>
</Messages>`);
  });

  it('should escape XML special characters', () => {
    const messages = [
      {
        role: 'user' as const,
        content: 'Test with <tags> & "quotes" and \'apostrophes\'',
      },
      { role: 'assistant' as const, content: 'Response with > and < symbols' },
    ];

    const xml = convertToXml(messages);

    expect(xml).toBe(`<Messages>
<UserMessage>Test with &lt;tags&gt; &amp; &quot;quotes&quot; and &apos;apostrophes&apos;</UserMessage>
<AssistantMessage>Response with &gt; and &lt; symbols</AssistantMessage>
</Messages>`);
  });

  it('should handle empty message array', () => {
    const messages: any[] = [];

    const xml = convertToXml(messages);

    expect(xml).toBe(`<Messages>
</Messages>`);
  });

  it('should handle multiline content', () => {
    const messages = [
      { role: 'user' as const, content: 'Line 1\nLine 2\nLine 3' },
      { role: 'assistant' as const, content: 'Response\nwith multiple\nlines' },
    ];

    const xml = convertToXml(messages);

    expect(xml).toBe(`<Messages>
<UserMessage>Line 1
Line 2
Line 3</UserMessage>
<AssistantMessage>Response
with multiple
lines</AssistantMessage>
</Messages>`);
  });
});
