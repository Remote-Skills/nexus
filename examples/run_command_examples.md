# run_command Tool Examples

The `run_command` tool allows Nexus to execute shell commands safely with built-in timeout and output management.

## Key Features

### 1. **Timeout Protection**
Prevents commands from hanging indefinitely:
- Default timeout: 30 seconds
- Configurable up to 300 seconds (5 minutes)
- Commands are killed if they exceed the timeout

### 2. **Output Management**
Prevents memory issues from large outputs:
- Default limit: 10,000 characters
- Captures both STDOUT and STDERR
- Automatically truncates with a clear message

### 3. **Error Handling**
Gracefully handles failures:
- Returns error information instead of crashing
- Includes exit codes, stderr, and stdout
- Helps the agent understand what went wrong and retry

## Example Use Cases

### Package Management
```bash
nexus "Install dependencies and check for vulnerabilities"
# Executes: npm install
# Then: npm audit

nexus "Update all packages to latest versions"
# Executes: npm update
# Then: npm outdated to verify
```

### Git Operations
```bash
nexus "Check git status and show uncommitted changes"
# Executes: git status
# Then: git diff

nexus "Create a new branch for feature X"
# Executes: git checkout -b feature-x
```

### Testing
```bash
nexus "Run tests and show me only the failures"
# Executes: npm test
# Parses output for failures

nexus "Run linter and fix auto-fixable issues"
# Executes: npm run lint -- --fix
```

### Build & Deploy
```bash
nexus "Build the project and check for errors"
# Executes: npm run build
# Checks exit code and stderr

nexus "Build and show build size"
# Executes: npm run build
# Parses output for size information
```

### System Information
```bash
nexus "Check Node.js and npm versions"
# Executes: node --version && npm --version

nexus "Show disk space usage"
# Executes: df -h (Linux/Mac) or wmic logicaldisk (Windows)
```

### Long-Running Commands
```bash
nexus "Run integration tests with 60 second timeout"
# Uses: timeout_seconds: 60
# Prevents test suite from hanging

nexus "Build Docker image with 300 second timeout"
# Uses: timeout_seconds: 300
# Allows longer builds
```

## Safety Mechanisms

### 1. Timeout Example
```typescript
// Command that takes too long
{
  command: "npm test",
  timeout_seconds: 5  // Will kill after 5 seconds
}

// Result: "Command was killed (timeout: 5s)"
```

### 2. Output Truncation Example
```typescript
// Command with lots of output
{
  command: "npm install --verbose",
  max_output_chars: 5000  // Only show first 5000 characters
}

// Result: "... (output truncated, showed 5000 of 25000 characters)"
```

### 3. Error Handling Example
```typescript
// Command that fails
{
  command: "npm run nonexistent-script"
}

// Result includes:
// - STDERR: Error message
// - Exit Code: 1
// - Agent can see the error and adjust plan
```

## Working Directory

Commands can be executed in specific directories:

```typescript
{
  command: "npm test",
  working_directory: "./backend"
}
```

This allows the agent to work with monorepos or multi-project setups.

## Best Practices

1. **Use Appropriate Timeouts**
   - Quick commands: 30s (default)
   - Build commands: 60-120s
   - Complex builds: 180-300s

2. **Limit Output for Verbose Commands**
   - Use `--quiet` or `--silent` flags when possible
   - Set `max_output_chars` for very verbose commands

3. **Chain Commands Carefully**
   - Use `&&` for dependent commands
   - Use `;` for independent commands
   - Example: `npm install && npm test`

4. **Cross-Platform Commands**
   - Node.js/npm commands work everywhere
   - Avoid shell-specific syntax
   - Use portable tools when possible

## Security Considerations

⚠️ **Important**: The agent can execute any shell command you authorize. Use with trusted prompts and review the agent's actions.

- Commands run with your user permissions
- No sandboxing or restrictions
- Review commands in agent output before confirming
- Don't share sensitive information in command output

## Comparison with Interactive Tools

Unlike VS Code's terminal, this tool is designed for:
- ✅ Quick command execution
- ✅ Capturing and analyzing output
- ✅ Automated workflows
- ❌ NOT for interactive shells
- ❌ NOT for long-running servers (use proper tools for that)
- ❌ NOT for commands requiring user input
