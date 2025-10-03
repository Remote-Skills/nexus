import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { tools } from './tools/index.js';
import { executeTool } from './tools/executor.js';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const MAX_TOKENS = parseInt(process.env.ANTHROPIC_MAX_TOKENS || '4096');
const MAX_ITERATIONS = 15;

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
 * Check for CLAUDE.md or AGENTS.md in the current directory
 * and return its content if found
 */
function loadCustomInstructions(): string | null {
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
 * Build the system prompt, optionally including custom instructions
 */
function buildSystemPrompt(): string {
  const customInstructions = loadCustomInstructions();
  
  let systemPrompt = `You are Nexus, an intelligent agentic file assistant. You help users with file operations by planning and executing tasks step-by-step.

CRITICAL INSTRUCTIONS:
1. ALWAYS create a detailed TODO list/plan BEFORE taking any action
2. Show your plan to the user with clear steps
3. Execute each step methodically
4. Check results after each action
5. Adapt your plan if something fails
6. Provide a final summary when complete

AVAILABLE TOOLS:
- create_file: Create new files with content
- read_file: Read file contents (supports line ranges, preview, search)
- edit_file: Edit existing files (replace or append)
- delete_file: Delete files
- list_files: List directory contents
- smart_search: Search for files or content recursively
- run_command: Execute shell commands with timeout protection (npm, git, build tools, etc.)

PLANNING FORMAT:
When you receive a task, first respond with:
"📋 PLAN:
1. [First step]
2. [Second step]
3. [Third step]
...

Now executing..."

Then proceed with tool calls.

ERROR RECOVERY PROTOCOL:
When a tool fails:
1. Read the error message carefully
2. Identify what's missing or wrong (e.g., missing parameters, file not found)
3. Fix the issue and retry, or try a different approach
4. Common fixes:
   - edit_file needs old_text? → Use read_file first to get exact content
   - Missing parameters? → Add them and retry
   - File not found? → Use list_files to verify the correct path
   - Can't find text to replace? → Read the file again and copy exact text

TOOL USAGE BEST PRACTICES:
- Before edit_file in replace mode: Use read_file first to see current content
- Before delete_file: Consider if you can use edit_file instead
- Before create_file: Use list_files to check if file already exists
- After any write operation: Use read_file to verify the change worked

SAFETY:
- You have a maximum of ${MAX_ITERATIONS} iterations
- Avoid infinite loops by trying different approaches when stuck
- Ask for clarification if task is unclear`;

  // Append custom instructions if found
  if (customInstructions) {
    systemPrompt += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CUSTOM PROJECT INSTRUCTIONS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${customInstructions}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Follow the custom project instructions above when working in this directory.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }
  
  return systemPrompt;
}

export async function chatWithToolsAgentic(userMessage: string): Promise<void> {
  const messages: Message[] = [
    { role: 'user', content: userMessage }
  ];
  
  let iterationCount = 0;
  const completedActions = new Set<string>();
  const spinner = ora();
  
  console.log(chalk.cyan('🎯 TASK:'), chalk.white(userMessage));
  console.log('');
  
  while (iterationCount < MAX_ITERATIONS) {
    iterationCount++;
    
    try {
      spinner.start(chalk.gray(`Thinking... (iteration ${iterationCount}/${MAX_ITERATIONS})`));
      
      const apiClient = getClient();
      const response = await apiClient.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(),
        messages: messages as any,
        tools: tools as any,
      });
      
      spinner.stop();
      
      // Handle text response
      const textBlocks = response.content.filter(block => block.type === 'text');
      if (textBlocks.length > 0) {
        console.log(chalk.blue('💭 THINKING:'));
        textBlocks.forEach((block: any) => {
          console.log(chalk.white(block.text));
        });
        console.log('');
      }
      
      // Handle tool use
      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');
      
      if (toolUseBlocks.length === 0) {
        // No more tools to use, agent is done
        console.log(chalk.green('✅ COMPLETED'));
        console.log(chalk.gray(`Total iterations: ${iterationCount}`));
        console.log(chalk.gray(`Actions performed: ${completedActions.size}`));
        break;
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
        
        // Track action with exact signature
        const actionSignature = `${toolName}:${JSON.stringify(toolInput)}`;
        
        // Only block EXACT duplicates (same tool + same parameters)
        if (completedActions.has(actionSignature)) {
          console.log(chalk.yellow(`⚠️  Skipping exact duplicate: ${toolName}`));
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolId,
            content: 'This exact action was already completed - skipping to avoid duplication'
          });
          continue;
        }
        
        // Track action
        completedActions.add(actionSignature);
        
        // Execute tool
        console.log(chalk.magenta('🔧 TOOL:'), chalk.white(toolName));
        console.log(chalk.gray('Input:'), chalk.dim(JSON.stringify(toolInput, null, 2)));
        
        const spinner2 = ora(chalk.gray(`Executing ${toolName}...`)).start();
        
        try {
          const result = await executeTool(toolName, toolInput);
          spinner2.succeed(chalk.green(`${toolName} completed`));
          
          console.log(chalk.cyan('Result:'), chalk.white(result.substring(0, 500) + (result.length > 500 ? '...' : '')));
          console.log('');
          
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolId,
            content: result
          });
        } catch (error: any) {
          spinner2.fail(chalk.red(`${toolName} failed`));
          console.log(chalk.red('Error:'), error.message);
          console.log('');
          
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
