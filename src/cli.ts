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
  
  console.log(boxen(banner + '\n' + chalk.white('Intelligent Agentic File Assistant'), {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'cyan'
  }));
}

// Interactive mode
async function interactiveMode() {
  printBanner();
  
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
  .option('-k, --api-key <key>', 'Anthropic API key')
  .option('-m, --model <model>', 'Claude model to use')
  .action(async (taskArgs: string[], options) => {
    // Set API key from CLI if provided
    if (options.apiKey) {
      process.env.ANTHROPIC_API_KEY = options.apiKey;
    }
    
    if (options.model) {
      process.env.ANTHROPIC_MODEL = options.model;
    }
    
    // Check API key
    if (!process.env.ANTHROPIC_API_KEY) {
      printBanner();
      console.error(chalk.red.bold('\n❌ API Key Not Found\n'));
      console.log(chalk.yellow('Nexus requires an Anthropic API key to function.\n'));
      
      console.log(chalk.cyan.bold('🔑 Setup Options:\n'));
      
      console.log(chalk.white('1️⃣  Create a ') + chalk.green('.env') + chalk.white(' file in your project:'));
      console.log(chalk.gray('   echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > .env\n'));
      
      console.log(chalk.white('2️⃣  Pass it as a command-line argument:'));
      console.log(chalk.gray('   nexus --api-key sk-ant-your-key-here "your task"\n'));
      
      console.log(chalk.white('3️⃣  Set as an environment variable:'));
      console.log(chalk.gray('   # Windows (PowerShell):'));
      console.log(chalk.gray('   $env:ANTHROPIC_API_KEY="sk-ant-your-key-here"\n'));
      console.log(chalk.gray('   # Linux/Mac:'));
      console.log(chalk.gray('   export ANTHROPIC_API_KEY="sk-ant-your-key-here"\n'));
      
      console.log(chalk.cyan('📖 Get your API key from: ') + chalk.blue.underline('https://console.anthropic.com/'));
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
    await chatWithToolsAgentic(task);
  });

program.parse();
