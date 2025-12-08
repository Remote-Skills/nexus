import OpenAI from 'openai';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import prompts from 'prompts';
import { tools } from './tools/index.js';
import { executeTool } from './tools/executor.js';

const MODEL = process.env.ANTHROPIC_MODEL || 'anthropic/claude-sonnet-4.5';
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

// Session state tracking for recent operations
interface SessionState {
  recentOperations: string[];
  createdFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
  lastReset: number;
}

let sessionTokenUsage: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0
};

let sessionState: SessionState = {
  recentOperations: [],
  createdFiles: [],
  modifiedFiles: [],
  deletedFiles: [],
  lastReset: Date.now()
};

// Reset session state if it's been more than 30 minutes
function checkSessionReset(): void {
  const thirtyMinutes = 30 * 60 * 1000;
  if (Date.now() - sessionState.lastReset > thirtyMinutes) {
    sessionState = {
      recentOperations: [],
      createdFiles: [],
      modifiedFiles: [],
      deletedFiles: [],
      lastReset: Date.now()
    };
  }
}

// Track file operations
function trackOperation(operation: string, filePath?: string): void {
  checkSessionReset();
  
  // Keep only last 5 operations to avoid prompt bloat
  if (sessionState.recentOperations.length >= 5) {
    sessionState.recentOperations.shift();
  }
  sessionState.recentOperations.push(operation);
  
  if (filePath) {
    const fileName = path.basename(filePath);
    
    if (operation.includes('create')) {
      if (!sessionState.createdFiles.includes(fileName)) {
        sessionState.createdFiles.push(fileName);
      }
    } else if (operation.includes('edit') || operation.includes('modif')) {
      if (!sessionState.modifiedFiles.includes(fileName)) {
        sessionState.modifiedFiles.push(fileName);
      }
    } else if (operation.includes('delet')) {
      sessionState.deletedFiles.push(fileName);
      // Remove from created/modified if deleted
      sessionState.createdFiles = sessionState.createdFiles.filter(f => f !== fileName);
      sessionState.modifiedFiles = sessionState.modifiedFiles.filter(f => f !== fileName);
    }
  }
}

// Generate session context for system prompt
function getSessionContext(): string {
  checkSessionReset();
  
  if (sessionState.recentOperations.length === 0) {
    return '';
  }
  
  let context = '\n\n📋 SESSION CONTEXT (avoid repeating these operations):';
  
  if (sessionState.createdFiles.length > 0) {
    context += `\n✅ Created: ${sessionState.createdFiles.join(', ')}`;
  }
  
  if (sessionState.modifiedFiles.length > 0) {
    context += `\n✏️ Modified: ${sessionState.modifiedFiles.join(', ')}`;
  }
  
  if (sessionState.deletedFiles.length > 0) {
    context += `\n🗑️ Deleted: ${sessionState.deletedFiles.join(', ')}`;
  }
  
  if (sessionState.recentOperations.length > 0) {
    context += `\n🔄 Recent: ${sessionState.recentOperations.slice(-3).join(' → ')}`;
  }
  
  context += '\n💡 Skip existence checks for files shown above. Build on previous work.';
  
  return context;
}

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

/**
 * Analyze task complexity to determine appropriate planning level
 */
function analyzeTaskComplexity(task: string): 'simple' | 'medium' | 'complex' {
  const lowerTask = task.toLowerCase();
  
  // Simple tasks: basic file operations with clear intent
  const simplePatterns = [
    /delete (all )?files?( in (this|current) folder)?/,
    /remove (all )?files?( in (this|current) folder)?/,
    /delete \w+\.(\w+)$/,
    /remove \w+\.(\w+)$/,
    /rename \w+ to \w+/,
    /move \w+ to \w+/,
    /copy \w+ to \w+/,
    /list files?( in (this|current) folder)?/,
    /show files?( in (this|current) folder)?/
  ];
  
  // Complex tasks: multi-step, creative, or analytical work
  const complexPatterns = [
    /create .+ (project|application|website|app)/,
    /build .+ (system|architecture|framework)/,
    /analyze .+ (code|structure|pattern)/,
    /refactor .+ (code|functions|classes)/,
    /implement .+ (feature|functionality|algorithm)/,
    /design .+ (component|module|interface)/,
    /(write|create) .+ (template|email|document) .+ (aesthetic|design|style)/
  ];
  
  if (simplePatterns.some(pattern => pattern.test(lowerTask))) {
    return 'simple';
  }
  
  if (complexPatterns.some(pattern => pattern.test(lowerTask))) {
    return 'complex';
  }
  
  // Medium complexity for everything else
  return 'medium';
}

// Cache for expensive operations
let cachedSystemPrompt: string | null = null;
let cachedCustomInstructions: string | null = null;
let customInstructionsPath: string | null = null;
let customInstructionsLastModified: number = 0;

// Lazy client initialization
let client: OpenAI;
function getClient(): OpenAI {
  if (!client) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not set');
    }
    client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/remoteskills/nexus',
        'X-Title': 'Nexus Agent',
      },
    });
  }
  return client;
}

function convertToolsToOpenAI(anthropicTools: any[]) {
  return anthropicTools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema
    }
  }));
}

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
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
function buildSystemPrompt(forceRebuild: boolean = false, taskComplexity: 'simple' | 'medium' | 'complex' = 'medium'): string {
  if (cachedSystemPrompt && !forceRebuild && ENABLE_TOKEN_OPTIMIZATION && taskComplexity === 'medium') {
    return cachedSystemPrompt;
  }

  const customInstructions = loadCustomInstructions();
  let systemPrompt = '';
  
  if (taskComplexity === 'simple') {
    systemPrompt = `You are Nexus. Simple mode.
Skip planning. Use tools immediately.
Tools: list_files, create_file, edit_file, delete_file, smart_search, smart_replace, run_command${getSessionContext()}`;
    
  } else if (taskComplexity === 'complex') {
    systemPrompt = `You are Nexus. Complex mode.
1. Plan (numbered steps)
2. Wait for approval
3. Execute
Tools: list_files, smart_search, read_file, create_file, edit_file, delete_file, smart_replace, run_command
Max ${MAX_ITERATIONS} iterations${getSessionContext()}`;
    
  } else {
    systemPrompt = `You are Nexus.
Simple tasks: Direct execution.
Complex tasks: Plan -> Approve -> Execute.
Tools: list_files, smart_search, read_file, create_file, edit_file, delete_file, smart_replace, run_command
Max ${MAX_ITERATIONS} iterations${getSessionContext()}`;
  }

  if (customInstructions) {
    const maxCustomLength = 1000; // Reduced from 2000
    const truncatedInstructions = customInstructions.length > maxCustomLength 
      ? customInstructions.substring(0, maxCustomLength) + '\n[...truncated]'
      : customInstructions;

    systemPrompt += `\n\nPROJECT INSTRUCTIONS:\n${truncatedInstructions}`;
  }

  if (ENABLE_TOKEN_OPTIMIZATION) {
    cachedSystemPrompt = systemPrompt;
  }

  return systemPrompt;
}

/**
 * Truncate tool results to save tokens while preserving essential information
 */
function truncateToolResult(result: string, toolName: string): string {
  if (!ENABLE_TOKEN_OPTIMIZATION || result.length <= 1000) { // Reduced default limit
    return result;
  }

  switch (toolName) {
    case 'list_files':
      const lines = result.split('\n');
      if (lines.length > 30) {
        return lines.slice(0, 20).join('\n') + 
          `\n... [${lines.length - 25} files truncated] ...\n` +
          lines.slice(-5).join('\n');
      }
      break;
    
    case 'read_file':
      // Allow more context for read_file but still truncate
      if (result.length <= 3000) return result;
      const halfLength = 1500;
      return result.substring(0, halfLength) + 
        `\n... [${result.length - 3000} chars truncated] ...\n` +
        result.substring(result.length - halfLength);
    
    case 'smart_search':
      const searchLines = result.split('\n');
      if (searchLines.length > 15) {
        return searchLines.slice(0, 15).join('\n') + 
          `\n... [${searchLines.length - 15} results truncated] ...`;
      }
      break;
    
    case 'run_command':
      if (result.includes('HIGH-RISK') || result.includes('Error') || result.includes('error')) {
        return result;
      }
      if (result.length > 2000) {
        return result.substring(0, 1000) + 
          `\n... [output truncated] ...\n` + 
          result.substring(result.length - 500);
      }
      break;
    
    default:
      return result.substring(0, 1000) + `\n... [truncated] ...`;
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
  const toolCallIds = new Set<string>();
  
  for (const message of messages) {
    if (message.role === 'assistant' && message.tool_calls) {
      message.tool_calls.forEach((tc: any) => toolCallIds.add(tc.id));
    }
  }
  
  for (const message of messages) {
    if (message.role === 'tool' && message.tool_call_id) {
      if (!toolCallIds.has(message.tool_call_id)) {
        console.error(chalk.red(`⚠️  Orphaned tool result found: ${message.tool_call_id}`));
        return false;
      }
    }
  }
  
  return true;
}

function trimConversationHistory(messages: Message[]): Message[] {
  if (!ENABLE_TOKEN_OPTIMIZATION || messages.length <= MAX_CONTEXT_MESSAGES) {
    return messages;
  }

  const firstMessage = messages[0];
  let keepFromIndex = Math.max(1, messages.length - MAX_CONTEXT_MESSAGES + 1);
  
  while (keepFromIndex < messages.length) {
    const msg = messages[keepFromIndex];
    if (msg.role === 'tool') {
      keepFromIndex--;
    } else {
      break;
    }
  }
  
  const recentMessages = messages.slice(keepFromIndex);
  
  if (keepFromIndex > 1) {
    const summaryMessage: Message = {
      role: 'user',
      content: '[Previous conversation history truncated for token efficiency.]'
    };
    return [firstMessage, summaryMessage, ...recentMessages];
  }
  
  return messages;
}

export async function chatWithToolsAgentic(userMessage: string): Promise<void> {
  // Analyze task complexity to determine approach
  const taskComplexity = analyzeTaskComplexity(userMessage);
  
  const messages: Message[] = [
    { role: 'user', content: userMessage }
  ];
  
  let iterationCount = 0;
  let actionCount = 0;
  let planApproved = taskComplexity === 'simple'; // Skip planning for simple tasks
  let estimatedTokens = 0;
  const spinner = ora();
  
  console.log(chalk.cyan('🎯 TASK:'), chalk.white(userMessage));
  console.log(chalk.gray(`🧠 Complexity: ${taskComplexity.toUpperCase()}`));
  if (taskComplexity === 'simple') {
    console.log(chalk.gray('⚡ Skipping plan approval for simple task'));
  }
  console.log(chalk.gray(`💰 Session tokens: ${formatTokenUsage()}`));
  console.log('');
  
  while (iterationCount < MAX_ITERATIONS) {
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
      
      // Build system prompt with task complexity
      const systemPrompt = buildSystemPrompt(false, taskComplexity);
      
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...optimizedMessages
      ];

      // Estimate input tokens for tracking
      const inputText = JSON.stringify(apiMessages);
      
      // Enable streaming for better responsiveness and timeout handling
      const stream = await apiClient.chat.completions.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: apiMessages as any,
        tools: planApproved ? convertToolsToOpenAI(tools) : undefined,
        stream: true,
      });

      let fullContent = '';
      const toolCallsMap = new Map<number, any>();
      let isFirstChunk = true;

      for await (const chunk of stream) {
        if (isFirstChunk) {
          spinner.stop();
          isFirstChunk = false;
        }

        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          process.stdout.write(delta.content);
          fullContent += delta.content;
        }

        if (delta.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            const index = toolCall.index;
            if (!toolCallsMap.has(index)) {
              toolCallsMap.set(index, {
                index,
                id: toolCall.id,
                type: toolCall.type,
                function: { name: '', arguments: '' }
              });
            }
            
            const currentTool = toolCallsMap.get(index);
            if (toolCall.id) currentTool.id = toolCall.id;
            if (toolCall.type) currentTool.type = toolCall.type;
            if (toolCall.function?.name) currentTool.function.name += toolCall.function.name;
            if (toolCall.function?.arguments) currentTool.function.arguments += toolCall.function.arguments;
          }
        }
      }
      
      // Add a newline after streaming content
      if (fullContent) {
        console.log('');
      }

      // Reconstruct the message object from stream data
      const toolCalls = Array.from(toolCallsMap.values());
      const message = {
        role: 'assistant' as const,
        content: fullContent || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined
      };
      
      // Track token usage (approximate for stream)
      const outputText = JSON.stringify(message);
      updateTokenUsage(inputText, outputText);

      const content = message.content;

      messages.push(message as Message);

      // Handle text response
      if (content) {
        const fullText = content;

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

      if (!planApproved && toolCalls && toolCalls.length > 0) {
        // Agent is trying to use tools before plan approval
        console.log(chalk.yellow('⚠️  Agent attempted to use tools before plan approval'));
        messages.push({
          role: 'user',
          content: 'Please provide a clear plan first before using any tools. Start with "📋 PLAN:" and wait for approval.'
        });
        continue;
      }

      if ((!toolCalls || toolCalls.length === 0) && planApproved) {
        // No more tools to use and plan was approved, but check if this is the first response after approval
        if (messages.length > 0 && messages[messages.length - 2].content?.includes('Plan is APPROVED')) {
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
      } else if ((!toolCalls || toolCalls.length === 0) && !planApproved) {
        // No tools and no plan yet, continue to get plan
        messages.push({
          role: 'user',
          content: 'Please provide a detailed plan with numbered steps before proceeding.'
        });
        continue;
      }

      // Execute tools
      if (toolCalls) {
        const toolResults: Message[] = [];
        for (const toolCall of toolCalls) {
          if (toolCall.type !== 'function') continue;

          const toolName = toolCall.function.name;
          const toolId = toolCall.id;
          let toolInput: any;
          
          try {
            toolInput = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            console.error(chalk.red(`❌ Failed to parse arguments for tool ${toolName}`));
            toolResults.push({
              role: 'tool',
              tool_call_id: toolId,
              content: 'Error: Failed to parse JSON arguments'
            });
            continue;
          }

          actionCount++;
          const spinner2 = ora(chalk.gray(`🔧 ${toolName}...`)).start();
          
          if (toolName === 'create_file' && toolInput.path) {
            spinner2.text = chalk.gray(`📄 Creating ${path.basename(toolInput.path)}...`);
          } else if (toolName === 'edit_file' && toolInput.path) {
            spinner2.text = chalk.gray(`✏️ Editing ${path.basename(toolInput.path)}...`);
          } else if (toolName === 'read_file' && toolInput.path) {
            spinner2.text = chalk.gray(`🔍 Reading ${path.basename(toolInput.path)}...`);
          }

          try {
            const result = await executeTool(toolName, toolInput);
            
            // Track the operation for session context
            if (toolName === 'create_file' && toolInput.path) {
              trackOperation(`Created ${path.basename(toolInput.path)}`, toolInput.path);
            } else if (toolName === 'edit_file' && toolInput.path) {
              trackOperation(`Modified ${path.basename(toolInput.path)}`, toolInput.path);
            } else if (toolName === 'delete_file' && toolInput.path) {
              trackOperation(`Deleted ${path.basename(toolInput.path)}`, toolInput.path);
            } else {
              trackOperation(`Executed ${toolName}`);
            }
            
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
              role: 'tool',
              tool_call_id: toolId,
              content: truncatedResult
            });
          } catch (error: any) {
            spinner2.fail(chalk.red(`${toolName} failed`));
            console.log(chalk.red('❌ Error:'), error.message);
            
            toolResults.push({
              role: 'tool',
              tool_call_id: toolId,
              content: `Error: ${error.message}`
            });
          }
        }
        messages.push(...toolResults);
      }

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

/**
 * Low-token mode for simple tasks (delete, move, rename, etc.)
 * Directly executes tool calls with minimal planning and context
 */
export async function runLowTokenTask(task: string): Promise<void> {
  // Detect delete all files task
  if (/delete all files? in this folder/i.test(task)) {
    const cwd = process.cwd();
    const files = fs.readdirSync(cwd).filter(f => !f.startsWith('.') && f !== 'node_modules');
    if (files.length === 0) {
      console.log(chalk.yellow('No files to delete.'));
      return;
    }
    console.log(chalk.cyan('Deleting files:'), files.join(', '));
    let deleted = 0;
    for (const file of files) {
      try {
        await executeTool('delete_file', { path: path.join(cwd, file) });
        console.log(chalk.green(`✓ Deleted ${file}`));
        deleted++;
      } catch (err: any) {
        console.log(chalk.red(`Failed to delete ${file}: ${err.message}`));
      }
    }
    console.log(chalk.green(`Done. Deleted ${deleted} files.`));
    // Estimate and show token usage (minimal)
    const usage = formatTokenUsage();
    console.log(chalk.gray(`💰 Token usage: ${usage}`));
    return;
  }
  // ...add more low-token patterns here...
  // Fallback to normal agent if not a simple task
  return await chatWithToolsAgentic(task);
}