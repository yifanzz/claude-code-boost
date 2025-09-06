#!/usr/bin/env tsx

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { parseStringPromise } from 'xml2js';

const PARSED_CONVERSATIONS_DIR = 'parsed_conversations';

interface ConversationStats {
  project: string;
  filename: string;
  filePath: string;
  userMessages: number;
  assistantMessages: number;
  totalMessages: number;
  userMessageLengths: number[];
  assistantMessageLengths: number[];
  avgUserMessageLength: number;
  avgAssistantMessageLength: number;
  userGuidanceScore: number; // Higher score = more user guidance needed
}

interface UserGuidanceAnalysis {
  shortUserMessages: number; // Messages < 50 chars (likely confirmations/corrections)
  longUserMessages: number; // Messages > 200 chars (likely detailed instructions)
  clarificationCount: number; // Messages containing clarification keywords
  correctionCount: number; // Messages containing correction keywords
  instructionCount: number; // Messages containing instruction keywords
}

function calculateUserGuidanceScore(
  userMessages: string[],
  assistantMessages: string[]
): number {
  if (userMessages.length === 0) return 0;

  let score = 0;
  const analysis: UserGuidanceAnalysis = {
    shortUserMessages: 0,
    longUserMessages: 0,
    clarificationCount: 0,
    correctionCount: 0,
    instructionCount: 0,
  };

  // Keywords that indicate need for guidance
  const clarificationKeywords = [
    'what',
    'how',
    'why',
    'which',
    'where',
    'can you',
    'could you',
    '?',
  ];
  const correctionKeywords = [
    'no',
    'not',
    'wrong',
    'error',
    'fix',
    'change',
    'instead',
    'actually',
    'should be',
  ];
  const instructionKeywords = [
    'please',
    'need to',
    'want to',
    'make sure',
    'ensure',
    'add',
    'remove',
    'update',
  ];

  for (const message of userMessages) {
    const lowerMessage = message.toLowerCase();
    const messageLength = message.length;

    // Count message length patterns
    if (messageLength < 50) {
      analysis.shortUserMessages++;
      score += 1; // Short messages often indicate confirmations or corrections
    } else if (messageLength > 200) {
      analysis.longUserMessages++;
      score += 2; // Long messages indicate detailed instructions needed
    }

    // Count clarification patterns
    if (
      clarificationKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      analysis.clarificationCount++;
      score += 2;
    }

    // Count correction patterns
    if (correctionKeywords.some((keyword) => lowerMessage.includes(keyword))) {
      analysis.correctionCount++;
      score += 3; // Corrections indicate the assistant made mistakes
    }

    // Count instruction patterns
    if (instructionKeywords.some((keyword) => lowerMessage.includes(keyword))) {
      analysis.instructionCount++;
      score += 1;
    }
  }

  // Factor in message frequency ratio
  const messageRatio =
    userMessages.length / (userMessages.length + assistantMessages.length);
  if (messageRatio > 0.4) {
    // If user messages are >40% of conversation
    score += 10; // High user participation indicates need for guidance
  }

  return score;
}

async function parseXmlFile(
  filePath: string
): Promise<ConversationStats | null> {
  try {
    const xmlContent = readFileSync(filePath, 'utf8');
    const parsed = await parseStringPromise(xmlContent);

    if (!parsed.Messages) {
      return null;
    }

    const userMessages: string[] = [];
    const assistantMessages: string[] = [];

    // Extract messages
    if (parsed.Messages.UserMessage) {
      for (const msg of parsed.Messages.UserMessage) {
        if (typeof msg === 'string') {
          userMessages.push(msg);
        } else if (msg._) {
          userMessages.push(msg._);
        }
      }
    }

    if (parsed.Messages.AssistantMessage) {
      for (const msg of parsed.Messages.AssistantMessage) {
        if (typeof msg === 'string') {
          assistantMessages.push(msg);
        } else if (msg._) {
          assistantMessages.push(msg._);
        }
      }
    }

    const userMessageLengths = userMessages.map((msg) => msg.length);
    const assistantMessageLengths = assistantMessages.map((msg) => msg.length);

    const avgUserLength =
      userMessageLengths.length > 0
        ? userMessageLengths.reduce((a, b) => a + b, 0) /
          userMessageLengths.length
        : 0;
    const avgAssistantLength =
      assistantMessageLengths.length > 0
        ? assistantMessageLengths.reduce((a, b) => a + b, 0) /
          assistantMessageLengths.length
        : 0;

    const userGuidanceScore = calculateUserGuidanceScore(
      userMessages,
      assistantMessages
    );

    const pathParts = filePath.split('/');
    const filename = pathParts[pathParts.length - 1];
    const project = pathParts[pathParts.length - 2];

    return {
      project,
      filename,
      filePath,
      userMessages: userMessages.length,
      assistantMessages: assistantMessages.length,
      totalMessages: userMessages.length + assistantMessages.length,
      userMessageLengths,
      assistantMessageLengths,
      avgUserMessageLength: avgUserLength,
      avgAssistantMessageLength: avgAssistantLength,
      userGuidanceScore,
    };
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return null;
  }
}

function findXmlFiles(dir: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...findXmlFiles(fullPath));
      } else if (entry.endsWith('.xml')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.warn(`Could not read directory ${dir}:`, error);
  }

  return files;
}

function generateReport(stats: ConversationStats[]) {
  console.log('='.repeat(80));
  console.log('CONVERSATION ANALYSIS REPORT');
  console.log('='.repeat(80));

  console.log(`\nTotal conversations analyzed: ${stats.length}`);

  // Overall statistics
  const totalUserMessages = stats.reduce((sum, s) => sum + s.userMessages, 0);
  const totalAssistantMessages = stats.reduce(
    (sum, s) => sum + s.assistantMessages,
    0
  );
  const avgUserMessages = totalUserMessages / stats.length;
  const avgAssistantMessages = totalAssistantMessages / stats.length;

  console.log(`Total user messages: ${totalUserMessages}`);
  console.log(`Total assistant messages: ${totalAssistantMessages}`);
  console.log(
    `Average user messages per conversation: ${avgUserMessages.toFixed(1)}`
  );
  console.log(
    `Average assistant messages per conversation: ${avgAssistantMessages.toFixed(1)}`
  );

  // Top 10 conversations with fewest user messages
  console.log('\n' + '='.repeat(50));
  console.log('TOP 10 CONVERSATIONS WITH FEWEST USER MESSAGES');
  console.log('='.repeat(50));

  const sortedByUserMessages = [...stats].sort(
    (a, b) => a.userMessages - b.userMessages
  );

  for (let i = 0; i < Math.min(10, sortedByUserMessages.length); i++) {
    const conv = sortedByUserMessages[i];
    console.log(`\n${i + 1}. ${conv.project}/${conv.filename}`);
    console.log(`   User messages: ${conv.userMessages}`);
    console.log(`   Assistant messages: ${conv.assistantMessages}`);
    console.log(`   Total messages: ${conv.totalMessages}`);
    console.log(
      `   Avg user message length: ${conv.avgUserMessageLength.toFixed(0)} chars`
    );
    console.log(`   User guidance score: ${conv.userGuidanceScore}`);
  }

  // Top 10 conversations requiring most user guidance
  console.log('\n' + '='.repeat(50));
  console.log('TOP 10 CONVERSATIONS REQUIRING MOST USER GUIDANCE');
  console.log('='.repeat(50));

  const sortedByGuidance = [...stats].sort(
    (a, b) => b.userGuidanceScore - a.userGuidanceScore
  );

  for (let i = 0; i < Math.min(10, sortedByGuidance.length); i++) {
    const conv = sortedByGuidance[i];
    console.log(`\n${i + 1}. ${conv.project}/${conv.filename}`);
    console.log(`   User guidance score: ${conv.userGuidanceScore}`);
    console.log(`   User messages: ${conv.userMessages}`);
    console.log(`   Assistant messages: ${conv.assistantMessages}`);
    console.log(
      `   User/Total ratio: ${((conv.userMessages / conv.totalMessages) * 100).toFixed(1)}%`
    );
    console.log(
      `   Avg user message length: ${conv.avgUserMessageLength.toFixed(0)} chars`
    );
  }

  // Project breakdown
  console.log('\n' + '='.repeat(50));
  console.log('BREAKDOWN BY PROJECT');
  console.log('='.repeat(50));

  const projectStats = stats.reduce(
    (acc, stat) => {
      if (!acc[stat.project]) {
        acc[stat.project] = {
          count: 0,
          userMessages: 0,
          assistantMessages: 0,
          totalGuidanceScore: 0,
        };
      }
      acc[stat.project].count++;
      acc[stat.project].userMessages += stat.userMessages;
      acc[stat.project].assistantMessages += stat.assistantMessages;
      acc[stat.project].totalGuidanceScore += stat.userGuidanceScore;
      return acc;
    },
    {} as Record<string, any>
  );

  for (const [project, data] of Object.entries(projectStats)) {
    console.log(`\n${project}:`);
    console.log(`   Conversations: ${data.count}`);
    console.log(
      `   Avg user messages: ${(data.userMessages / data.count).toFixed(1)}`
    );
    console.log(
      `   Avg assistant messages: ${(data.assistantMessages / data.count).toFixed(1)}`
    );
    console.log(
      `   Avg guidance score: ${(data.totalGuidanceScore / data.count).toFixed(1)}`
    );
  }
}

async function main() {
  console.log('Finding XML files...');
  const xmlFiles = findXmlFiles(PARSED_CONVERSATIONS_DIR);
  console.log(`Found ${xmlFiles.length} XML files\n`);

  if (xmlFiles.length === 0) {
    console.log('No XML files found. Run extract-all-conversations.ts first.');
    return;
  }

  console.log('Parsing XML files...');
  const stats: ConversationStats[] = [];

  for (let i = 0; i < xmlFiles.length; i++) {
    const file = xmlFiles[i];
    process.stdout.write(
      `\rProgress: ${i + 1}/${xmlFiles.length} (${(((i + 1) / xmlFiles.length) * 100).toFixed(1)}%)`
    );

    const stat = await parseXmlFile(file);
    if (stat) {
      stats.push(stat);
    }
  }

  console.log('\n');
  generateReport(stats);
}

// Run main function if this file is executed directly
main().catch(console.error);
