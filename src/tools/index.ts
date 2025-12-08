export const tools = [
  {
    name: 'create_file',
    description: `Create a new file with content.
- path: File path (relative/absolute)
- content: File content (required)
- Checks existence first. Creates dirs automatically.`,
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        content: { type: 'string', description: 'File content' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'read_file',
    description: `Read file contents.
- path: File path
- start_line/end_line: Read specific lines (1-indexed)
- preview_only: Read first 500 chars (check size/type)
- search_term: Find specific term
- max_chars: Limit output (default: 10000)
Usage: Preview first, then read specific lines or search.`,
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        start_line: { type: 'number', description: 'Start line' },
        end_line: { type: 'number', description: 'End line' },
        preview_only: { type: 'boolean', description: 'First 500 chars only' },
        search_term: { type: 'string', description: 'Search term' },
        max_chars: { type: 'number', description: 'Max chars' }
      },
      required: ['path']
    }
  },
  {
    name: 'edit_file',
    description: `Edit file content.
- path: File path
- mode: 'replace' (default) or 'append'
- old_text: Exact text to replace (required for replace mode)
- new_text: New content
Usage: Read file first. Copy exact old_text.`,
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        old_text: { type: 'string', description: 'Text to replace' },
        new_text: { type: 'string', description: 'New text' },
        mode: { type: 'string', enum: ['replace', 'append'], description: 'Edit mode' }
      },
      required: ['path', 'new_text', 'mode']
    }
  },
  {
    name: 'delete_file',
    description: 'Delete file or directory.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to delete' }
      },
      required: ['path']
    }
  },
  {
    name: 'list_files',
    description: `List directory contents.
- path: Directory path (default: current)
- recursive: List recursively
Usage: Use first to explore structure.`,
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path' },
        recursive: { type: 'boolean', description: 'Recursive list' }
      },
      required: []
    }
  },
  {
    name: 'smart_search',
    description: `Search files or content.
- pattern: Search pattern
- search_type: 'filename' or 'content'
- directory: Start directory
Usage: Find files/code before reading.`,
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern' },
        search_type: { type: 'string', enum: ['filename', 'content'], description: 'Search type' },
        directory: { type: 'string', description: 'Start directory' }
      },
      required: ['pattern', 'search_type']
    }
  },
  {
    name: 'smart_replace',
    description: `Semantic code replacement.
- path: File path
- search_mode: 'function', 'class', 'method', 'block', 'variable'
- target: Name/pattern to replace
- new_code: Replacement code
Usage: Replace logical blocks (functions/classes) safely.`,
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        search_mode: { type: 'string', enum: ['function', 'class', 'method', 'block', 'variable'], description: 'Search mode' },
        target: { type: 'string', description: 'Target name/pattern' },
        new_code: { type: 'string', description: 'New code' },
        preserve_comments: { type: 'boolean', description: 'Preserve comments' }
      },
      required: ['path', 'search_mode', 'target', 'new_code']
    }
  },
  {
    name: 'run_command',
    description: `Execute shell command.
- command: Command to run
- working_directory: CWD
- timeout_seconds: Max time
- approve_risky: Bypass approval (use carefully)
Usage: Run commands safely.`,
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command' },
        working_directory: { type: 'string', description: 'Working directory' },
        timeout_seconds: { type: 'number', description: 'Timeout (s)' },
        max_output_chars: { type: 'number', description: 'Max output chars' },
        approve_risky: { type: 'boolean', description: 'Bypass approval' },
        show_full_output: { type: 'boolean', description: 'Show full output' }
      },
      required: ['command']
    }
  }
];
