import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import prompts from 'prompts';
import { tools } from './tools/index.js';
import { executeTool } from './tools/executor.js';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const MAX_TOKENS = parseInt(process.env.ANTHROPIC_MAX_TOKENS || '4096');
const MAX_ITERATIONS = 15;
const MAX_CONTEXT_MESSAGES = 10; // Limit conversation history
const MAX_TOOL_RESULT_LENGTH = 2000; // Truncate long tool results
const ENABLE_TOKEN_OPTIMIZATION = process.env.NEXUS_OPTIMIZE_TOKENS !== 'false';

// Token usage tracking
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

let sessionTokenUsage: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0
};

// Rough token estimation (Claude Sonnet uses ~4 chars per token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function updateTokenUsage(input: string, output: string): void {
  const inputTokens = estimateTokens(input);
  const outputTokens = estimateTokens(output);
  
  sessionTokenUsage.inputTokens += inputTokens;
  sessionTokenUsage.outputTokens += outputTokens;
  sessionTokenUsage.totalTokens += inputTokens + outputTokens;
}

function formatTokenUsage(): string {
  const total = sessionTokenUsage.totalTokens;
  const cost = (total / 1000) * 0.003; // Rough cost estimate for Claude Sonnet
  return `${total.toLocaleString()} tokens (~$${cost.toFixed(4)})`;
}

// Cache for expensive operations
let cachedSystemPrompt: string | null = null;
let cachedCustomInstructions: string | null = null;
let customInstructionsPath: string | null = null;
let customInstructionsLastModified: number = 0;

// Lazy client initialization
let client: Anthropic;
function getClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return client;
}

interface Message {
  role: 'user' | 'assistant';
  content: string | any[];
}

/**
 * Extract plan from agent response text
 */
function extractPlan(text: string): string | null {
  // Look for plan markers
  const planMarkers = [
    /📋\s*PLAN[:\s]*([\s\S]*?)(?=\n\n|Now executing|$)/i,
    /PLAN[:\s]*([\s\S]*?)(?=\n\n|Now executing|$)/i,
    /\d+\.\s+[^\n]+(?:\n\d+\.\s+[^\n]+)*/g
  ];

  for (const marker of planMarkers) {
    const match = text.match(marker);
    if (match) {
      return match[1] || match[0];
    }
  }

  // If no explicit plan found, look for numbered lists
  const numberedList = text.match(/\d+\.\s+[^\n]+(?:\n\d+\.\s+[^\n]+)*/g);
  if (numberedList && numberedList[0]) {
    return numberedList[0];
  }

  return null;
}

/**
 * Get user approval for the plan
 */
async function getUserPlanApproval(plan: string): Promise<{ approved: boolean; feedback?: string; newPlan?: string }> {
  console.log('');
  console.log(chalk.blue('📋 PROPOSED PLAN:'));
  console.log(chalk.white(plan));
  console.log('');

  const response = await prompts({
    type: 'select',
    name: 'action',
    message: 'What would you like to do with this plan?',
    choices: [
      { title: '✅ Approve and execute', value: 'approve' },
      { title: '✏️  Provide feedback for adjustment', value: 'feedback' },
      { title: '📝 Provide a different plan', value: 'replace' },
      { title: '❌ Cancel', value: 'cancel' }
    ],
    initial: 0
  });

  if (!response.action || response.action === 'cancel') {
    return { approved: false };
  }

  if (response.action === 'approve') {
    return { approved: true };
  }

  if (response.action === 'feedback') {
    const feedback = await prompts({
      type: 'text',
      name: 'feedback',
      message: 'What adjustments would you like to the plan?',
      validate: value => value.length > 0 ? true : 'Please provide feedback'
    });

    if (!feedback.feedback) {
      return { approved: false };
    }

    return { approved: false, feedback: feedback.feedback };
  }

  if (response.action === 'replace') {
    const newPlan = await prompts({
      type: 'text',
      name: 'plan',
      message: 'Enter your preferred plan (use numbered steps):',
      validate: value => value.length > 0 ? true : 'Please provide a plan'
    });

    if (!newPlan.plan) {
      return { approved: false };
    }

    return { approved: true, newPlan: newPlan.plan };
  }

  return { approved: false };
}

/**
 * Load custom instructions with caching and modification time checking
 */
function loadCustomInstructions(): string | null {
  if (!ENABLE_TOKEN_OPTIMIZATION) {
    // Fallback to original behavior
    return loadCustomInstructionsUncached();
  }

  const cwd = process.cwd();
  const possibleFiles = ['CLAUDE.md', 'AGENTS.md'];

  // Check if we need to reload
  let needsReload = !cachedCustomInstructions;
  let currentPath: string | null = null;
  let currentModified = 0;

  for (const filename of possibleFiles) {
    const filePath = path.join(cwd, filename);
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        currentPath = filePath;
        currentModified = stats.mtimeMs;
        
        if (customInstructionsPath !== filePath || customInstructionsLastModified < currentModified) {
          needsReload = true;
        }
        break;
      }
    } catch (error) {
      // Silently ignore errors
    }
  }

  if (needsReload && currentPath) {
    try {
      const content = fs.readFileSync(currentPath, 'utf-8');
      cachedCustomInstructions = content;
      customInstructionsPath = currentPath;
      customInstructionsLastModified = currentModified;
      console.log(chalk.green(`📄 Loaded custom instructions from: ${path.basename(currentPath)}`));
    } catch (error) {
      cachedCustomInstructions = null;
    }
  } else if (!currentPath) {
    cachedCustomInstructions = null;
    customInstructionsPath = null;
  }

  return cachedCustomInstructions;
}

/**
 * Original uncached version for fallback
 */
function loadCustomInstructionsUncached(): string | null {
  const cwd = process.cwd();
  const possibleFiles = ['CLAUDE.md', 'AGENTS.md'];

  for (const filename of possibleFiles) {
    const filePath = path.join(cwd, filename);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        console.log(chalk.green(`📄 Loaded custom instructions from: ${filename}`));
        return content;
      }
    } catch (error) {
      // Silently ignore read errors
    }
  }

  return null;
}

/**
 * Build the system prompt with caching optimization
 */
function buildSystemPrompt(forceRebuild: boolean = false): string {
  // Use cached version if available and not forced to rebuild
  if (cachedSystemPrompt && !forceRebuild && ENABLE_TOKEN_OPTIMIZATION) {
    return cachedSystemPrompt;
  }

  const customInstructions = loadCustomInstructions();

  let systemPrompt = `You are Nexus, an intelligent agentic file assistant. You help users with file operations by planning and executing tasks step-by-step.

CRITICAL INSTRUCTIONS:
1. ALWAYS create a detailed plan BEFORE taking any action
2. Present your plan clearly and wait for user approval
3. ONLY start using tools after the user approves the plan
4. AFTER plan approval: Execute the plan step-by-step using tools
5. Be token-conscious: use smart_search and list_files before reading large files

PLANNING PHASE REQUIREMENTS:
- Start with "📋 PLAN:" followed by numbered steps
- Be specific about which files to read/edit/create
- Mention token-saving strategies (search before read, line ranges, etc.)
- Include verification steps
- End with "Waiting for user approval before execution..."

EXECUTION PHASE (after plan approval):
- DO NOT create another plan
- Start executing the approved plan immediately using tools
- Work through each step systematically
- Use the tools to accomplish the task

DO NOT USE ANY TOOLS until the user approves your plan!
AFTER plan approval: USE TOOLS to execute the plan!

⚠️  TOKEN EFFICIENCY IS CRITICAL:
- Reading files costs tokens - be strategic!
- NEVER read entire large files blindly
- ALWAYS use smart_search or preview_only FIRST to understand structure
- Only read specific sections you actually need
- Use line ranges for targeted reading
- The user is paying per token - respect their budget!

AVAILABLE TOOLS:
- list_files: List directory contents (use FIRST to understand structure)
- smart_search: Search for files or content (use to FIND what you need)
- read_file: Read file contents (STRATEGIC use only - supports preview, line ranges, search)
- create_file: Create new files with content
- edit_file: Edit existing files (replace or append)
- delete_file: Delete files
- run_command: Execute shell commands with timeout protection

STRATEGIC READING APPROACH:
📊 Step 1: EXPLORE (low cost)
   - Use list_files to see project structure
   - Use smart_search to find relevant files
   - Use read_file with preview_only=true to check file size/type

🎯 Step 2: TARGET (medium cost)
   - Use read_file with search_term to find specific code
   - Use line ranges (start_line/end_line) to read only relevant sections
   - Read configuration files fully (usually small)

📖 Step 3: DEEP READ (high cost - use sparingly)
   - Only read large files if absolutely necessary
   - Read implementation files in chunks using line ranges
   - Never read minified files, node_modules, or build output

SAFETY:
- Maximum of ${MAX_ITERATIONS} iterations total
- Always get plan approval before tool execution
- Ask for clarification if task is unclear`;

  // Append custom instructions if found (only if they're not too long)
  if (customInstructions) {
    const maxCustomLength = 2000; // Limit custom instructions to 2000 chars
    const truncatedInstructions = customInstructions.length > maxCustomLength 
      ? customInstructions.substring(0, maxCustomLength) + '\n\n[...truncated for token efficiency]'
      : customInstructions;

    systemPrompt += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CUSTOM PROJECT INSTRUCTIONS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${truncatedInstructions}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Follow the custom project instructions above when working in this directory.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }

  // Cache the result
  if (ENABLE_TOKEN_OPTIMIZATION) {
    cachedSystemPrompt = systemPrompt;
  }

  return systemPrompt;
}

/**
 * Truncate tool results to save tokens while preserving essential information
 */
function truncateToolResult(result: string, toolName: string): string {
  if (!ENABLE_TOKEN_OPTIMIZATION || result.length <= MAX_TOOL_RESULT_LENGTH) {
    return result;
  }

  // Smart truncation based on tool type
  switch (toolName) {
    case 'list_files':
      // Keep directory structure but limit file list
      const lines = result.split('\n');
      if (lines.length > 50) {
        return lines.slice(0, 30).join('\n') + 
          `\n\n... [${lines.length - 30} more files truncated for token efficiency] ...\n\n` +
          lines.slice(-10).join('\n');
      }
      break;
    
    case 'read_file':
      // Truncate from middle, keep beginning and end
      const halfLength = Math.floor(MAX_TOOL_RESULT_LENGTH / 2);
      return result.substring(0, halfLength) + 
        `\n\n... [${result.length - MAX_TOOL_RESULT_LENGTH} characters truncated for token efficiency] ...\n\n` +
        result.substring(result.length - halfLength);
    
    case 'smart_search':
      // Keep first few results
      const searchLines = result.split('\n');
      if (searchLines.length > 20) {
        return searchLines.slice(0, 20).join('\n') + 
          `\n... [${searchLines.length - 20} more search results truncated] ...`;
      }
      break;
    
    case 'run_command':
      // Keep important parts of command output
      if (result.includes('ERROR') || result.includes('error')) {
        // Keep full error output
        return result;
      }
      // Truncate long successful output
      return result.substring(0, MAX_TOOL_RESULT_LENGTH) + 
        `\n\n... [output truncated for token efficiency] ...`;
    
    default:
      // Generic truncation
      return result.substring(0, MAX_TOOL_RESULT_LENGTH) + 
        `\n\n... [truncated for token efficiency] ...`;
  }

  return result;
}

/**
 * Trim conversation history while preserving tool_use/tool_result pairs
 */
/**
 * Validate that tool_use and tool_result blocks are properly paired
 */
function validateToolPairs(messages: Message[]): boolean {
  const toolUseIds = new Set<string>();
  const toolResultIds = new Set<string>();
  
  for (const message of messages) {
    if (typeof message.content === 'object' && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type === 'tool_use') {
          toolUseIds.add(block.id);
        } else if (block.type === 'tool_result') {
          toolResultIds.add(block.tool_use_id);
        }
      }
    }
  }
  
  // Check for orphaned tool_results
  for (const resultId of toolResultIds) {
    if (!toolUseIds.has(resultId)) {
      console.error(chalk.red(`⚠️  Orphaned tool_result found: ${resultId}`));
      return false;
    }
  }
  
  return true;
}

function trimConversationHistory(messages: Message[]): Message[] {
  if (!ENABLE_TOKEN_OPTIMIZATION || messages.length <= MAX_CONTEXT_MESSAGES) {
    return messages;
  }

  // Always keep the first message (user's original request)
  const firstMessage = messages[0];
  
  // Find safe truncation point that doesn't break tool pairs
  let keepFromIndex = Math.max(1, messages.length - MAX_CONTEXT_MESSAGES + 1);
  
  // Scan backwards to find a safe truncation point
  for (let i = keepFromIndex; i < messages.length; i++) {
    const message = messages[i];
    
    // If this message has tool_result blocks, make sure we keep the corresponding tool_use
    if (message.role === 'user' && typeof message.content === 'object' && Array.isArray(message.content)) {
      const hasToolResults = message.content.some((block: any) => block.type === 'tool_result');
      
      if (hasToolResults && i > 0) {
        // Make sure the previous message (should contain tool_use) is included
        const prevMessage = messages[i - 1];
        if (prevMessage.role === 'assistant') {
          keepFromIndex = Math.min(keepFromIndex, i - 1);
        }
      }
    }
    
    // If this is an assistant message with tool_use, ensure any following tool_results are kept
    if (message.role === 'assistant' && typeof message.content === 'object' && Array.isArray(message.content)) {
      const hasToolUse = message.content.some((block: any) => block.type === 'tool_use');
      
      if (hasToolUse && i < messages.length - 1) {
        const nextMessage = messages[i + 1];
        if (nextMessage.role === 'user' && typeof nextMessage.content === 'object') {
          // Ensure we don't truncate before the tool_result
          keepFromIndex = Math.min(keepFromIndex, i);
        }
      }
    }
  }
  
  const recentMessages = messages.slice(keepFromIndex);
  
  // Only add summary if we actually truncated something
  if (keepFromIndex > 1) {
    const summaryMessage: Message = {
      role: 'user',
      content: '[Previous conversation history truncated for token efficiency. Tool pairs preserved.]'
    };
    return [firstMessage, summaryMessage, ...recentMessages];
  }
  
  return messages;
}

export async function chatWithToolsAgentic(userMessage: string): Promise<void> {
  const messages: Message[] = [
    { role: 'user', content: userMessage }
  ];
  
  let iterationCount = 0;
  let actionCount = 0;
  let planApproved = false;
  let estimatedTokens = 0;
  const spinner = ora();
  
  console.log(chalk.cyan('🎯 TASK:'), chalk.white(userMessage));
  console.log(chalk.gray(`💰 Session tokens: ${formatTokenUsage()}`));
  console.log('');  while (iterationCount < MAX_ITERATIONS) {
    iterationCount++;

    try {
      if (!planApproved) {
        spinner.start(chalk.gray(`🤔 Planning step ${iterationCount}...`));
      } else {
        spinner.start(chalk.gray(`⚡ Executing step ${iterationCount}...`));
      }

      const apiClient = getClient();
      
      // Optimize messages for token efficiency
      const optimizedMessages = ENABLE_TOKEN_OPTIMIZATION 
        ? trimConversationHistory(messages)
        : messages;
      
      // Validate tool pairs before API call
      if (!validateToolPairs(optimizedMessages)) {
        console.error(chalk.red('❌ Tool validation failed. Resetting conversation state.'));
        // Reset to just the original message to recover
        const resetMessages = [messages[0]];
        optimizedMessages.splice(0, optimizedMessages.length, ...resetMessages);
      }
      
      // Build system prompt (cached after first call)
      const systemPrompt = buildSystemPrompt();
      
      // Estimate input tokens for tracking
      const inputText = systemPrompt + JSON.stringify(optimizedMessages);
      
      const response = await apiClient.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: optimizedMessages as any,
        tools: planApproved ? tools as any : [], // Only provide tools after plan approval
      });
      
      // Track token usage
      const outputText = JSON.stringify(response.content);
      updateTokenUsage(inputText, outputText);

      spinner.stop();

      // Handle text response
      const textBlocks = response.content.filter(block => block.type === 'text');
      if (textBlocks.length > 0) {
        const fullText = textBlocks.map((block: any) => block.text).join('\n');

        if (!planApproved) {
          // Look for plan in the response
          const plan = extractPlan(fullText);

          if (plan) {
            // Get user approval for the plan
            const approval = await getUserPlanApproval(plan);

            if (approval.approved) {
              planApproved = true;
              console.log(chalk.green('✅ Plan approved! Starting execution...'));
              console.log('');

              // If user provided a different plan, update the conversation
              if (approval.newPlan) {
                messages.push({
                  role: 'user',
                  content: `Please follow this plan instead:\n\n${approval.newPlan}\n\nPlan is APPROVED. Start executing it now using the available tools. Do NOT create another plan.`
                });
              } else {
                messages.push({
                  role: 'user',
                  content: 'Plan is APPROVED. Start executing it step by step using the available tools. Do NOT create another plan.'
                });
              }
              continue;
            } else if (approval.feedback) {
              console.log(chalk.yellow('📝 Plan needs adjustment...'));
              console.log('');
              messages.push({
                role: 'user',
                content: `Please revise the plan based on this feedback: ${approval.feedback}`
              });
              continue;
            } else {
              console.log(chalk.red('❌ Task cancelled by user'));
              return;
            }
          } else {
            // No plan found, show response with better context
            console.log(chalk.blue('� ANALYZING:'));
            console.log(chalk.white(fullText));
            console.log('');

            messages.push({
              role: 'user',
              content: 'Please provide a clear numbered plan before proceeding. Start with "📋 PLAN:" and list specific steps.'
            });
            continue;
          }
        } else {
          // Plan already approved, show execution thinking
          console.log(chalk.blue('💭 THINKING:'));
          console.log(chalk.white(fullText));
          console.log('');
        }
      }

      // Handle tool use (only if plan is approved)
      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');

      if (!planApproved && toolUseBlocks.length > 0) {
        // Agent is trying to use tools before plan approval
        console.log(chalk.yellow('⚠️  Agent attempted to use tools before plan approval'));
        messages.push({
          role: 'user',
          content: 'Please provide a clear plan first before using any tools. Start with "📋 PLAN:" and wait for approval.'
        });
        continue;
      }

      if (toolUseBlocks.length === 0 && planApproved) {
        // No more tools to use and plan was approved, but check if this is the first response after approval
        if (messages.length > 0 && messages[messages.length - 1].content.includes('Plan is APPROVED')) {
          // This is immediately after approval - AI should start using tools
          messages.push({
            role: 'user',
            content: 'You need to start executing the approved plan using tools. Begin with the first step and use the appropriate tool.'
          });
          continue;
        } else {
          // Genuinely done with execution
          console.log(chalk.green('✅ Task completed successfully!'));
          console.log(chalk.gray(`   Steps: ${iterationCount} | Actions: ${actionCount}`));
          console.log(chalk.gray(`   💰 Total usage: ${formatTokenUsage()}`));
          if (ENABLE_TOKEN_OPTIMIZATION) {
            console.log(chalk.gray('   ⚙️ Token optimizations applied'));
          }
          break;
        }
      } else if (toolUseBlocks.length === 0 && !planApproved) {
        // No tools and no plan yet, continue to get plan
        messages.push({
          role: 'user',
          content: 'Please provide a detailed plan with numbered steps before proceeding.'
        });
        continue;
      }

      // Add assistant message
      messages.push({
        role: 'assistant',
        content: response.content
      });

      // Execute tools
      const toolResults: any[] = [];

      for (const toolUse of toolUseBlocks) {
        const toolBlock = toolUse as any;
        const toolName = toolBlock.name;
        const toolInput = toolBlock.input;
        const toolId = toolBlock.id;

        actionCount++;

        // Execute tool with enhanced visibility
        const spinner2 = ora(chalk.gray(`🔧 ${toolName}...`)).start();
        
        // Show what's happening for file operations
        if (toolName === 'create_file' && toolInput.path) {
          spinner2.text = chalk.gray(`📄 Creating ${path.basename(toolInput.path)}...`);
        } else if (toolName === 'edit_file' && toolInput.path) {
          spinner2.text = chalk.gray(`✏️ Editing ${path.basename(toolInput.path)}...`);
        } else if (toolName === 'read_file' && toolInput.path) {
          spinner2.text = chalk.gray(`🔍 Reading ${path.basename(toolInput.path)}...`);
        }

        try {
          const result = await executeTool(toolName, toolInput);
          
          // Enhanced success messages for file operations
          if (toolName === 'create_file' && toolInput.path) {
            spinner2.succeed(chalk.green(`✓ Created ${path.basename(toolInput.path)}`));
          } else if (toolName === 'edit_file' && toolInput.path) {
            spinner2.succeed(chalk.green(`✓ Modified ${path.basename(toolInput.path)}`));
          } else if (toolName === 'smart_search') {
            spinner2.succeed(chalk.green(`✓ Search completed`));
          } else {
            spinner2.succeed(chalk.green(`✓ ${toolName} completed`));
          }
          
          // Truncate result for token efficiency
          const truncatedResult = truncateToolResult(result, toolName);
          const displayResult = truncatedResult.substring(0, 500) + (truncatedResult.length > 500 ? '...' : '');
          
          if (displayResult.trim()) {
            console.log(chalk.cyan('📄 Result:'), chalk.white(displayResult));
          }
          if (ENABLE_TOKEN_OPTIMIZATION && result.length > MAX_TOOL_RESULT_LENGTH) {
            console.log(chalk.gray(`   💰 Optimized: ${Math.round((1 - truncatedResult.length / result.length) * 100)}% token savings`));
          }
          console.log('');
          
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolId,
            content: truncatedResult // Use truncated result for API
          });
        } catch (error: any) {
          spinner2.fail(chalk.red(`${toolName} failed`));
          console.log(chalk.red('❌ Error:'), error.message);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolId,
            content: `Error: ${error.message}`,
            is_error: true
          });
        }
      }

      // Add tool results to messages
      messages.push({
        role: 'user',
        content: toolResults
      });

    } catch (error: any) {
      spinner.stop();

      // Provide helpful error messages for common issues
      if (error.status === 401) {
        console.error(chalk.red.bold('\n❌ Authentication Error\n'));
        console.log(chalk.yellow('Your API key is invalid or has been revoked.\n'));
        console.log(chalk.white('Please check your API key at: ') + chalk.blue.underline('https://console.anthropic.com/'));
        console.log(chalk.gray('\nMake sure you\'re using the correct key format: sk-ant-...\n'));
      } else if (error.status === 429) {
        console.error(chalk.red.bold('\n❌ Rate Limit Exceeded\n'));
        console.log(chalk.yellow('You\'ve hit the API rate limit.\n'));
        console.log(chalk.gray('Please wait a moment and try again.\n'));
      } else if (error.status === 500) {
        console.error(chalk.red.bold('\n❌ Server Error\n'));
        console.log(chalk.yellow('Anthropic\'s servers encountered an error.\n'));
        console.log(chalk.gray('Please try again in a few moments.\n'));
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        console.error(chalk.red.bold('\n❌ Network Error\n'));
        console.log(chalk.yellow('Unable to connect to Anthropic\'s API.\n'));
        console.log(chalk.gray('Please check your internet connection and try again.\n'));
      } else if (error.message && error.message.includes('tool_use_id')) {
        console.error(chalk.red.bold('\n❌ Tool Synchronization Error\n'));
        console.log(chalk.yellow('Tool use/result blocks are mismatched in conversation history.\n'));
        console.log(chalk.gray('This usually happens when message history gets corrupted.\n'));
        console.log(chalk.cyan('💡 Try restarting the task with a fresh session.\n'));
      } else {
        console.error(chalk.red('❌ Error:'), error.message);
        if (error.status) {
          console.log(chalk.gray(`Status Code: ${error.status}\n`));
        }
      }
      break;
    }
  }

  if (iterationCount >= MAX_ITERATIONS) {
    console.log(chalk.yellow(`⚠️  Reached maximum iterations (${MAX_ITERATIONS})`));
  }
}