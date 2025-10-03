import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import ora from 'ora';
import { tools } from './tools/index.js';
import { executeTool } from './tools/executor.js';

// Validate API key before creating client
if (!process.env.ANTHROPIC_API_KEY) {
  console.error(chalk.red('\n❌ Error: ANTHROPIC_API_KEY is required but not set.'));
  console.log(chalk.yellow('\nPlease configure your API key using one of these methods:'));
  console.log(chalk.gray('  • Create a .env file: ANTHROPIC_API_KEY=your_key'));
  console.log(chalk.gray('  • Use --api-key flag: nexus --api-key your_key "task"'));
  console.log(chalk.gray('  • Set environment: export ANTHROPIC_API_KEY=your_key\n'));
  process.exit(1);
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const MAX_TOKENS = parseInt(process.env.ANTHROPIC_MAX_TOKENS || '4096');
const MAX_ITERATIONS = 15;

interface Message {
  role: 'user' | 'assistant';
  content: string | any[];
}

// System prompt for agentic behavior
const SYSTEM_PROMPT = `You are Nexus, an intelligent agentic file assistant. You help users with file operations by planning and executing tasks step-by-step.

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

PLANNING FORMAT:
When you receive a task, first respond with:
"📋 PLAN:
1. [First step]
2. [Second step]
3. [Third step]
...

Now executing..."

Then proceed with tool calls.

SAFETY:
- You have a maximum of ${MAX_ITERATIONS} iterations
- Avoid infinite loops
- Don't repeat failed actions
- Ask for clarification if task is unclear`;

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
      
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
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
        
        // Track action
        const actionSignature = `${toolName}:${JSON.stringify(toolInput)}`;
        
        if (completedActions.has(actionSignature)) {
          console.log(chalk.yellow(`⚠️  Skipping duplicate action: ${toolName}`));
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolId,
            content: 'Action already completed - skipping to avoid duplication'
          });
          continue;
        }
        
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
