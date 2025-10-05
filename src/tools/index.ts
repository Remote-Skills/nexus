export const tools = [
  {
    name: 'create_file',
    description: `Create a new file with specified content. Use this for brand new files only.

REQUIRED PARAMETERS:
- path: File path (relative or absolute)
- content: File content (use "" for empty file, never leave undefined)

BEST PRACTICES:
- Check if file exists first using list_files
- If file already exists, use edit_file instead
- Always provide content parameter, even if empty
- Directories are created automatically if needed`,
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path (relative or absolute)'
        },
        content: {
          type: 'string',
          description: 'File content'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'read_file',
    description: `Read file contents with smart features: line ranges, preview, search.

⚠️  CRITICAL: Reading costs tokens! Be strategic!

SMART READING STRATEGY:
1. 📊 PREVIEW FIRST (500 chars)
   read_file(path: "file.ts", preview_only: true)
   → See file size, imports, structure
   → Decide if full read is needed

2. 🔍 SEARCH FOR CONTEXT (targeted)
   read_file(path: "file.ts", search_term: "function login")
   → Find specific code you need
   → Get line numbers for targeted reading

3. 🎯 READ SPECIFIC SECTIONS (line ranges)
   read_file(path: "file.ts", start_line: 45, end_line: 80)
   → Read only the function you need to edit
   → Avoid reading entire file

4. 📖 FULL READ (last resort)
   read_file(path: "config.json")
   → Only for small files (<5KB)
   → Auto-truncates at 10KB

WHEN TO USE EACH MODE:
- preview_only: Unknown files, checking size/type
- search_term: Finding specific code/config
- line ranges: Reading specific functions/sections
- Full read: Small config files only (<5KB)

❌ NEVER:
- Read large files (>10KB) without preview first
- Read entire implementation files blindly
- Read minified files or dependencies
- Read files you don't need

✅ BEST PRACTICES:
- Use smart_search to find files first
- Preview before full read
- Use line ranges for code sections
- Search for specific terms when possible`,
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to read'
        },
        start_line: {
          type: 'number',
          description: 'Start line number (1-indexed, optional)'
        },
        end_line: {
          type: 'number',
          description: 'End line number (1-indexed, optional)'
        },
        preview_only: {
          type: 'boolean',
          description: 'If true, return only first 500 characters'
        },
        search_term: {
          type: 'string',
          description: 'Search for specific term in file'
        },
        max_chars: {
          type: 'number',
          description: 'Maximum characters to return (default: 10000)'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'edit_file',
    description: `Edit existing file by replacing specific text or appending new content.

IMPORTANT USAGE PATTERNS:
1. REPLACE MODE (most common):
   - REQUIRED: First use read_file to see the current content
   - Copy the EXACT text you want to replace (including whitespace, newlines, indentation)
   - Provide both old_text (exact match) and new_text
   - Use cases: Replace entire function, update config value, fix code

2. APPEND MODE:
   - Adds new_text to the end of file
   - No old_text needed
   - Use cases: Add new import, append log entry, add new function

COMMON MISTAKES TO AVOID:
- ❌ Using empty or undefined old_text in replace mode
- ❌ Guessing at file content instead of reading it first
- ❌ Trying to replace text that doesn't exactly match
- ❌ Using this for new files (use create_file instead)

BEST PRACTICE WORKFLOW:
1. read_file to see current content
2. Copy exact text to replace
3. edit_file with that exact old_text
4. read_file again to verify it worked`,
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to edit'
        },
        old_text: {
          type: 'string',
          description: 'Text to replace (for replace mode)'
        },
        new_text: {
          type: 'string',
          description: 'New text content'
        },
        mode: {
          type: 'string',
          enum: ['replace', 'append'],
          description: 'Edit mode: replace old_text or append to end'
        }
      },
      required: ['path', 'new_text', 'mode']
    }
  },
  {
    name: 'delete_file',
    description: 'Delete a file or directory',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to delete'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'list_files',
    description: `List directory contents - Your FIRST step for exploration!

📊 LOW COST, HIGH VALUE:
- Shows directory structure without reading files
- Reveals file sizes to help prioritize
- Fast and cheap - use liberally!

WHEN TO USE:
1. 🎯 ALWAYS use this FIRST when starting a task
2. 📋 Understanding project structure
3. 🔍 Finding configuration files
4. 📁 Exploring directories before deep diving

STRATEGY:
- Non-recursive: Quick overview of current directory
- Recursive: See full project structure

EXAMPLES:
list_files() → See current directory
list_files(path: "src", recursive: true) → Explore src/ tree

✅ BEST PRACTICE: Use this before reading any files!`,
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path (default: current directory)'
        },
        recursive: {
          type: 'boolean',
          description: 'List recursively (default: false)'
        }
      },
      required: []
    }
  },
  {
    name: 'smart_search',
    description: `Search for files or content - Find before you read!

🎯 STRATEGIC TOOL for token efficiency:
- Find relevant files WITHOUT reading them all
- Search file content to locate specific code
- Get file paths for targeted reading

SEARCH TYPES:
1. 📄 'filename' - Find files by name
   smart_search(pattern: "config", search_type: "filename")
   → Finds: config.json, app.config.ts, etc.
   → THEN read only the relevant one

2. 🔍 'content' - Find code/text in files
   smart_search(pattern: "async function login", search_type: "content")
   → Shows which files contain this function
   → THEN read only those files (with line ranges!)

WHEN TO USE:
- ✅ Before reading: Find which files to read
- ✅ Locating specific functions/classes/config
- ✅ Understanding where code lives
- ✅ Avoiding blind file reading

⚠️  WORKFLOW:
1. smart_search to FIND relevant files
2. read_file with preview_only to CHECK size
3. read_file with line ranges to READ specific sections

EXAMPLE:
smart_search(pattern: "apiKey", search_type: "content")
→ Found in: src/config.ts, .env.example
→ read_file(path: "src/config.ts", search_term: "apiKey")
→ Targeted read of only what you need!`,
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Search pattern (filename or content)'
        },
        search_type: {
          type: 'string',
          enum: ['filename', 'content'],
          description: 'Search by filename or file content'
        },
        directory: {
          type: 'string',
          description: 'Starting directory (default: current)'
        }
      },
      required: ['pattern', 'search_type']
    }
  },
  {
    name: 'smart_replace',
    description: `Intelligent code block replacement - Replace functions, classes, or logical code blocks semantically.

🧠 SEMANTIC CODE REPLACEMENT:
- Find code blocks by function/class/method names
- Replace entire logical units (not just text)
- Language-aware parsing and replacement
- Preserve indentation and code structure

SEARCH MODES:
1. 🎯 'function' - Find and replace entire functions
   smart_replace(path: "file.ts", search_mode: "function", target: "getUserData", new_code: "...")
   → Finds function getUserData and replaces entire function body

2. 🏗️ 'class' - Find and replace entire classes
   smart_replace(path: "file.ts", search_mode: "class", target: "UserService", new_code: "...")
   → Replaces entire class definition

3. 🔧 'method' - Find and replace class methods
   smart_replace(path: "file.ts", search_mode: "method", target: "UserService.login", new_code: "...")
   → Finds login method in UserService class

4. 🎛️ 'block' - Replace any code block by start pattern
   smart_replace(path: "file.ts", search_mode: "block", target: "if (user.isAdmin)", new_code: "...")
   → Finds and replaces entire if block

5. 📝 'variable' - Replace variable declarations
   smart_replace(path: "file.ts", search_mode: "variable", target: "const API_URL", new_code: "...")
   → Replaces variable declaration and value

INTELLIGENT FEATURES:
- ✅ Preserves code formatting and indentation
- ✅ Handles TypeScript, JavaScript, Python, etc.
- ✅ Maintains imports and dependencies
- ✅ Validates syntax after replacement
- ✅ Shows before/after diff for confirmation

BEST PRACTICES:
1. Use read_file first to understand current structure
2. Specify the exact function/class name to target
3. Provide complete replacement code with proper syntax
4. Verify with read_file after replacement

EXAMPLES:
smart_replace(
  path: "src/auth.ts",
  search_mode: "function", 
  target: "validateUser",
  new_code: "async function validateUser(token: string): Promise<User> { /* new impl */ }"
)

smart_replace(
  path: "src/models.ts",
  search_mode: "class",
  target: "User", 
  new_code: "class User { /* new class definition */ }"
)`,
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to edit'
        },
        search_mode: {
          type: 'string',
          enum: ['function', 'class', 'method', 'block', 'variable'],
          description: 'Type of code element to find and replace'
        },
        target: {
          type: 'string',
          description: 'Name or pattern of the code element to replace (e.g., function name, class name, "ClassName.methodName" for methods)'
        },
        new_code: {
          type: 'string',
          description: 'Complete replacement code block with proper syntax and formatting'
        },
        preserve_comments: {
          type: 'boolean',
          description: 'Whether to preserve comments around the replaced code (default: true)'
        }
      },
      required: ['path', 'search_mode', 'target', 'new_code']
    }
  },
  {
    name: 'run_command',
    description: `Execute shell commands with comprehensive safety and output management.

🛡️ SAFETY FEATURES:
- Automatic risk assessment and approval prompts for dangerous commands
- Timeout protection to prevent hanging processes
- Smart output handling for large results
- Working directory validation

⚠️ HIGH-RISK COMMANDS (require explicit approval):
- Destructive operations: rm, del, format, rmdir
- System modifications: chmod, chown, sudo, su
- Network operations: curl, wget, ssh, scp
- Package installations: npm install, pip install, apt install
- Git operations affecting remote: git push, git force-push

✅ SAFE COMMANDS (auto-approved):
- Information gathering: ls, dir, git status, npm list
- Version checks: node --version, python --version
- Build operations: npm run build, npm test
- Local git operations: git add, git commit

📊 SMART OUTPUT HANDLING:
- Large outputs show last 50 lines (most relevant)
- Error outputs preserved in full
- Structured formatting for readability
- Token-efficient truncation

BEST PRACTICES:
- Use 'approve_risky: true' for dangerous commands you've reviewed
- Specify working_directory for context
- Set appropriate timeouts for long operations
- Use 'show_full_output: true' only when necessary`,
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute (e.g., "npm install", "git status", "python --version")'
        },
        working_directory: {
          type: 'string',
          description: 'Working directory for command execution (default: current directory)'
        },
        timeout_seconds: {
          type: 'number',
          description: 'Maximum execution time in seconds (default: 30, max recommended: 300)'
        },
        max_output_chars: {
          type: 'number',
          description: 'Maximum characters of output to return (default: 10000)'
        },
        approve_risky: {
          type: 'boolean',
          description: 'Set to true to bypass approval prompt for risky commands (use only after manual review)'
        },
        show_full_output: {
          type: 'boolean',
          description: 'Set to true to show full output instead of smart truncation (use sparingly for token efficiency)'
        }
      },
      required: ['command']
    }
  }
];
