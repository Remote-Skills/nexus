# Nexus - Intelligent Agentic Code Assistant

[![npm version](https://badge.fury.io/js/%40remo**Token Savings:**
- 🔄 Cached system prompts save ~1000 tokens per API call
- ✂️ Conversation trimming saves ~500-2000 tokens per long session  
- 📦 Result truncation saves ~1000-5000 tokens per large file operation
- 📄 Custom instruction limits prevent excessive prompt tokens

Total savings: **30-60% reduction in token usage** for typical workflows!

### Real-time Token Tracking 📊

Nexus now includes live token usage monitoring:

```bash
🎯 TASK: Create a welcome email template
💰 Session tokens: 2,847 tokens (~$0.0085)

⚙️  Configuration
   Model: claude-sonnet-4-20250514
   Token Optimization: ON
   💰 Token usage will be tracked in real-time

🤔 Planning step 1...
📋 PLAN: ...

⚡ Executing step 2...
📄 Creating welcome-email.html...
✓ Created welcome-email.html

✅ Task completed successfully!
   Steps: 3 | Actions: 2
   💰 Total usage: 4,123 tokens (~$0.0124)
```

**Features:**
- 💲 **Cost Estimation**: Real-time cost calculation based on current Claude Sonnet pricing
- 📈 **Session Tracking**: Cumulative token usage across all operations
- 🎯 **Operation Visibility**: See exactly which files are being created/modified
- ⚡ **Live Updates**: Token count updates after each API calls%2Fnexus.svg)](https://www.npmjs.com/package/nexus-agent)
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
npx nexus-agent "your task"
```

## Features

### Agentic Planning
- **Automatic Planning**: Creates a TODO list before executing tasks
- **Step-by-Step Execution**: Executes each step methodically
- **Loop Detection**: Prevents infinite loops and repeated actions
- **Adaptive Planning**: Adjusts plan if something fails
- **Progress Tracking**: Shows thinking, progress, and stats

### Developer Experience
- **Clean Output**: Reduced noise with clear, informative progress indicators
- **Configuration Display**: Shows model, token limits, and optimization status at startup
- **Smart Progress**: Context-aware spinner messages and clean result displays
- **File Operation Visibility**: Shows exactly which files are being created/modified/read
- **Real-time Token Tracking**: Live token usage and cost estimation during execution
- **Error Clarity**: Clear error messages with actionable guidance
- **Token Insights**: Real-time optimization feedback without overwhelming details

### Smart File Operations
- **Create/Read/Edit/Delete files** with intelligent handling
- **Smart Reading**: Line ranges, previews, search within files
- **Smart Search**: Find files by name pattern or content
- **Smart Replace**: Semantic code block replacement (functions, classes, methods)
- **Directory Exclusions**: Automatically skips node_modules, .git, etc.
- **Token Optimization**: 10K character limit prevents token explosion

### Safety Mechanisms
- **Iteration Limits**: Max 15 iterations to prevent runaway
- **Loop Detection**: Detects and warns about repeated actions
- **Action Tracking**: Prevents duplicate operations
- **Tool Pair Validation**: Ensures tool_use/tool_result blocks are properly matched
- **Error Handling**: Graceful failure with helpful messages
- **Command Timeouts**: Default 30s timeout prevents hanging on long-running commands
- **Output Limits**: 10K character limit prevents memory issues from large outputs

## Configuration

Create a `.env` file in your project root:

```env
ANTHROPIC_API_KEY=your_api_key_here
ANTHROPIC_MODEL=claude-sonnet-4-20250514
ANTHROPIC_MAX_TOKENS=4096
NEXUS_OPTIMIZE_TOKENS=true  # Enable token optimization (default: true)
```

### Token Optimization

Nexus includes intelligent token optimization to reduce costs with Claude Sonnet:

- **Smart Prompt Caching**: System prompts and custom instructions are cached after first load
- **Conversation Trimming**: Keeps only recent messages to prevent context bloat
- **Tool Result Truncation**: Large outputs are intelligently truncated while preserving key information
- **Custom Instruction Limits**: Project instructions are limited to 2000 characters and cached

**Environment Variable:**
```bash
export NEXUS_OPTIMIZE_TOKENS=false  # Disable optimizations for full verbosity
```

**Token Savings:**
- Cached system prompts save ~1000 tokens per API call
- Conversation trimming saves ~500-2000 tokens per long session  
- Result truncation saves ~1000-5000 tokens per large file operation
- Custom instruction limits prevent excessive prompt tokens

Total savings: **30-60% reduction in token usage** for typical workflows!

Or pass the API key via CLI:

```bash
nexus -k your_api_key "your task"
```

Or set as environment variable:

```bash
export ANTHROPIC_API_KEY=your_key
nexus "your task"
```

### Custom Project Instructions

Nexus automatically looks for `CLAUDE.md` or `AGENTS.md` in your current directory. If found, the content is included in the system prompt, allowing you to provide project-specific instructions, coding standards, or context.

**Example `CLAUDE.md`:**

```markdown
# Project Instructions

## Coding Standards
- Use TypeScript strict mode
- Follow functional programming patterns
- Add JSDoc comments for public APIs

## Project Structure
- Components go in `src/components/`
- Tests use Jest with `.test.ts` extension
- All exports must be typed

## Domain Knowledge
- This is an e-commerce platform
- User authentication uses JWT tokens
- Database is PostgreSQL with Prisma ORM
```

**How it works:**
1. Create `CLAUDE.md` or `AGENTS.md` in your project root
2. Add any project-specific guidelines, context, or requirements
3. Run Nexus from that directory - it automatically loads your instructions
4. The AI follows your custom guidelines when working on tasks

This is perfect for maintaining consistency across team members or ensuring AI agents understand your project's specific requirements!

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
import { chatWithToolsAgentic } from 'nexus-agent';

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

### Command Execution
```bash
nexus "Run npm install and check if there are any errors"
nexus "Check git status and create a commit with all changes"
nexus "Run the test suite and summarize the results"
```

### Smart Code Replacement
```bash
# Replace a specific function with new implementation
nexus "Replace the getUserData function with async version that uses fetch API"

# Replace an entire class with new design
nexus "Replace the UserService class with a new implementation using dependency injection"

# Replace a method within a class
nexus "Replace the login method in AuthService with OAuth2 implementation"

# Replace a code block by pattern
nexus "Replace the if statement checking user.isAdmin with role-based permissions"

# Replace variable declarations
nexus "Replace the API_URL constant with environment-based configuration"
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
| `run_command` | Execute shell commands with timeout protection (30s default, max 300s) |

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
- **Command Timeout**: 30s default, configurable up to 300s (5 minutes)
- **Output Truncation**: Command output limited to 10K characters by default
- **Error Handling**: Failed commands return error info instead of crashing

## Contributing

Contributions welcome! Feel free to:
- Add new tools
- Improve the planning logic
- Enhance safety mechanisms
- Report bugs or suggest features

## License

MIT License - Feel free to use and modify!

## Links

- [npm Package](https://www.npmjs.com/package/nexus-agent)
- [GitHub Repository](https://github.com/Remote-Skills/nexus)
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

## Smart Replace Feature

The `smart_replace` tool provides semantic code block replacement, going beyond simple text replacement to understand code structure:

### Supported Modes

#### Function Replacement
```typescript
// Original function
function getUserData(id: string) {
  return database.users.find(id);
}

// Nexus command: "Replace getUserData function with async version"
// Result:
async function getUserData(id: string): Promise<User> {
  return await database.users.findById(id);
}
```

#### Class Replacement
```typescript
// Replace entire class definition
class UserService {
  // Old implementation
}

// Becomes:
class UserService {
  constructor(private db: Database) {}
  
  async getUser(id: string): Promise<User> {
    return this.db.users.findById(id);
  }
}
```

#### Method Replacement
```typescript
// Replace specific method within class
class AuthService {
  login(username: string, password: string) {
    // Old login logic
  }
}

// Command: "Replace AuthService.login with OAuth2 implementation"
// Replaces only the login method, preserving the rest of the class
```

#### Code Block Replacement
```typescript
// Replace conditional blocks, loops, or any code pattern
if (user.role === 'admin') {
  // Old admin check
}

// Command: "Replace admin check with role-based permissions"
// Intelligently finds and replaces the entire if block
```

#### Variable Replacement
```typescript
// Replace variable declarations
const API_URL = 'https://api.example.com';

// Command: "Replace API_URL with environment-based configuration"
// Result:
const API_URL = process.env.API_URL || 'https://api.example.com';
```

### Key Features

- **Language Aware**: Supports TypeScript, JavaScript, Python, and more
- **Structure Preserving**: Maintains indentation and formatting
- **Comment Preservation**: Keeps relevant comments with replaced code
- **Scope Aware**: Finds methods within specific classes
- **Syntax Validation**: Ensures valid code structure after replacement

### Usage Tips

1. **Be Specific**: Use exact function/class names for precise targeting
2. **Provide Complete Code**: Include full replacement implementation
3. **Test After Replace**: Nexus will verify syntax but always test functionality
4. **Use with Read**: Read the file first to understand current structure

## Support

- **Issues**: [GitHub Issues](https://github.com/Remote-Skills/nexus/issues)
- **Email**: hi@remoteskills.io

---

**Made with ❤️ by [Remote Skills](https://remoteskills.io)**
