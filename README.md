# Nexus - Intelligent Agentic File Assistant

[![npm version](https://badge.fury.io/js/%40remoteskills%2Fnexus.svg)](https://www.npmjs.com/package/nexus-agent)
[![Node.js 18+](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful AI agent powered by Claude that plans and executes complex file operations step-by-step with built-in safety mechanisms.

**✅ Works on Windows, Mac, and Linux out of the box!**

## Quick Start

### Use with npx (No Installation Required)

```bash
npx nexus-agent "Create a Node.js Express server"
```

### Or Install Globally

```bash
npm install -g nexus-agent

# Now use anywhere
nexus "Create a React component"
nexus -i  # Interactive mode
```

### Or Install Locally in Project

```bash
npm install nexus-agent

# Use with npx
npx nexus "your task"
```

## Features

### Agentic Planning
- **Automatic Planning**: Creates a TODO list before executing tasks
- **Step-by-Step Execution**: Executes each step methodically
- **Loop Detection**: Prevents infinite loops and repeated actions
- **Adaptive Planning**: Adjusts plan if something fails
- **Progress Tracking**: Shows thinking, progress, and stats

### Smart File Operations
- **Create/Read/Edit/Delete files** with intelligent handling
- **Smart Reading**: Line ranges, previews, search within files
- **Smart Search**: Find files by name pattern or content
- **Directory Exclusions**: Automatically skips node_modules, .git, etc.
- **Token Optimization**: 10K character limit prevents token explosion

### Safety Mechanisms
- **Iteration Limits**: Max 15 iterations to prevent runaway
- **Loop Detection**: Detects and warns about repeated actions
- **Action Tracking**: Prevents duplicate operations
- **Error Handling**: Graceful failure with helpful messages

## Configuration

Create a `.env` file in your project root:

```env
ANTHROPIC_API_KEY=your_api_key_here
ANTHROPIC_MODEL=claude-sonnet-4-20250514
ANTHROPIC_MAX_TOKENS=4096
```

Or pass the API key via CLI:

```bash
nexus -k your_api_key "your task"
```

Or set as environment variable:

```bash
export ANTHROPIC_API_KEY=your_key
nexus "your task"
```

## Usage

### CLI Mode

```bash
# Single task
nexus "Create a TypeScript project with Express"

# Interactive mode
nexus -i
nexus --interactive

# With API key
nexus -k sk-ant-xxx "your task"

# Specify model
nexus -m claude-sonnet-4-20250514 "your task"

# Help
nexus --help
```

### Programmatic Usage

```typescript
import { chatWithToolsAgentic } from '@remoteskills/nexus';

await chatWithToolsAgentic("Create a REST API with authentication");
```

## Example Tasks

### Project Creation
```bash
nexus "Create a Next.js project with TypeScript, Tailwind, and a landing page"
```

### Code Analysis
```bash
nexus "Find all TODO comments in TypeScript files and create a summary"
```

### Refactoring
```bash
nexus "Find all files using 'var' and suggest converting to 'const' or 'let'"
```

### File Organization
```bash
nexus "Organize all .md files into a docs folder and create an index"
```

## Available Tools

| Tool | Description |
|------|-------------|
| `create_file` | Create files with content |
| `read_file` | Smart reading with line ranges, search, preview |
| `edit_file` | Replace or append content |
| `delete_file` | Delete files |
| `list_files` | List directory contents (excludes build dirs) |
| `smart_search` | Search by filename or content recursively |

## Why npm instead of pip?

**Cross-Platform Compatibility**: npm packages work identically on Windows, Mac, and Linux without PATH issues.

**Instant Availability**: Use `npx @remoteskills/nexus` anywhere without installation.

**Better Bin Scripts**: npm automatically handles executable scripts cross-platform.

**Modern Tooling**: TypeScript provides better type safety and developer experience.

## Development

```bash
# Clone repository
git clone https://github.com/Remote-Skills/nexus
cd nexus

# Install dependencies
npm install

# Run in development
npm run dev "your task"

# Build
npm run build

# Test built version
npm start "your task"
```

## Requirements

- Node.js 18 or higher
- Anthropic API key

## Safety & Limitations

- **Iteration Limit**: 15 iterations maximum
- **File Size**: Large files automatically truncated with warnings
- **Character Limit**: 10K default for reads
- **Loop Detection**: Prevents infinite loops
- **Excluded Dirs**: Skips node_modules, .git, dist, build, etc.

## Contributing

Contributions welcome! Feel free to:
- Add new tools
- Improve the planning logic
- Enhance safety mechanisms
- Report bugs or suggest features

## License

MIT License - Feel free to use and modify!

## Links

- [npm Package](https://www.npmjs.com/package/@remoteskills/nexus)
- [GitHub Repository](https://github.com/Remote-Skills/nexus-npm)
- [Python Version](https://pypi.org/project/nexus-ai-agent/)
- [Anthropic Claude](https://www.anthropic.com/claude)

## Troubleshooting

### API Key Issues

```bash
# Check if API key is set
echo $ANTHROPIC_API_KEY

# Set temporarily
export ANTHROPIC_API_KEY=your_key
nexus "your task"

# Or pass via CLI
nexus -k your_key "your task"
```

### Command Not Found (After Global Install)

```bash
# Check global install location
npm list -g nexus-agent

# Try with npx
npx nexus-agent "your task"

# Or reinstall
npm uninstall -g nexus-agent
npm install -g nexus-agent
```

### Permission Errors

```bash
# Install without sudo (recommended)
npm install -g nexus-agent --prefix ~/.local

# Add to PATH
export PATH=$PATH:~/.local/bin
```

## Support

- **Issues**: [GitHub Issues](https://github.com/Remote-Skills/nexus-npm/issues)
- **Email**: hi@remoteskills.io
- **Twitter**: [@RemoteSkills](https://twitter.com/RemoteSkills)

---

**Made with ❤️ by [Remote Skills](https://remoteskills.io)**
