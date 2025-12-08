#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import boxen from 'boxen';
import prompts from 'prompts';
import dotenv from 'dotenv';
import { chatWithToolsAgentic } from './agent.js';

dotenv.config();

const program = new Command();

// Banner
function printBanner() {
  const banner = chalk.cyan.bold(`
 ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗
 ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝
 ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗
 ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║
 ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║
 ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝
  `);

  console.log(boxen(banner + '\n' + chalk.white('Intelligent Agentic Code Assistant'), {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'cyan'
  }));
}

// Display configuration info
function printConfigInfo() {
  const model = process.env.ANTHROPIC_MODEL || 'anthropic/claude-sonnet-4.5';
  const maxTokens = process.env.ANTHROPIC_MAX_TOKENS || '4096';
  const tokenOptimization = process.env.NEXUS_OPTIMIZE_TOKENS !== 'false';

  console.log(chalk.cyan('⚙️  Configuration'));
  console.log(chalk.gray(`   Model: ${model}`));
  console.log(chalk.gray(`   Max Tokens: ${maxTokens}`));
  console.log(chalk.gray(`   Token Optimization: ${tokenOptimization ? 'ON' : 'OFF'}`));
  console.log(chalk.gray('   💰 Token usage will be tracked in real-time'));
  console.log('');
}

// Interactive mode
async function interactiveMode() {
  printBanner();
  printConfigInfo();

  console.log(chalk.gray('Type your task or "exit" to quit\n'));

  while (true) {
    const response = await prompts({
      type: 'text',
      name: 'task',
      message: chalk.cyan('Task:'),
    });

    if (!response.task || response.task.toLowerCase() === 'exit') {
      console.log(chalk.yellow('\nGoodbye! 👋'));
      process.exit(0);
    }

    console.log('');
    await chatWithToolsAgentic(response.task);
    console.log('');
  }
}

// CLI setup
program
  .name('nexus')
  .description('Intelligent Agentic File Assistant powered by Claude')
  .version('1.0.0')
  .argument('[task...]', 'Task to execute')
  .option('-i, --interactive', 'Run in interactive mode')
  .option('-k, --api-key <key>', 'OpenRouter API key')
  .option('-m, --model <model>', 'Model to use')
  .action(async (taskArgs: string[], options) => {
    // Set API key from CLI if provided
    if (options.apiKey) {
      process.env.OPENROUTER_API_KEY = options.apiKey;
    }

    if (options.model) {
      process.env.ANTHROPIC_MODEL = options.model;
    }

    // Check API key
    if (!process.env.OPENROUTER_API_KEY) {
      printBanner();
      console.error(chalk.red.bold('\n❌ API Key Not Found\n'));
      console.log(chalk.yellow('Nexus requires an OpenRouter API key to function.\n'));

      console.log(chalk.cyan.bold('🔑 Setup Options:\n'));

      console.log(chalk.white('1️⃣  Create a ') + chalk.green('.env') + chalk.white(' file in your project:'));
      console.log(chalk.gray('   echo "OPENROUTER_API_KEY=sk-or-your-key-here" > .env\n'));

      console.log(chalk.white('2️⃣  Pass it as a command-line argument:'));
      console.log(chalk.gray('   nexus --api-key sk-or-your-key-here "your task"\n'));

      console.log(chalk.white('3️⃣  Set as an environment variable:'));
      console.log(chalk.gray('   # Windows (PowerShell):'));
      console.log(chalk.gray('   $env:OPENROUTER_API_KEY="sk-or-your-key-here"\n'));
      console.log(chalk.gray('   # Linux/Mac:'));
      console.log(chalk.gray('   export OPENROUTER_API_KEY="sk-or-your-key-here"\n'));

      console.log(chalk.cyan('📖 Get your API key from: ') + chalk.blue.underline('https://openrouter.ai/keys'));
      console.log(chalk.gray('\nFor more help, visit: ') + chalk.blue('https://github.com/remoteskills/nexus\n'));
      process.exit(1);
    }

    // Interactive mode
    if (options.interactive || taskArgs.length === 0) {
      await interactiveMode();
      return;
    }

    // Single task mode
    const task = taskArgs.join(' ');
    printBanner();
    printConfigInfo();
    await chatWithToolsAgentic(task);
  });

program.parse();
