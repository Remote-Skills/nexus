export const tools = [
  {
    name: 'create_file',
    description: 'Create a new file with specified content',
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
    description: 'Read file contents with smart features: line ranges, preview, search',
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
    description: 'Edit existing file by replacing content or appending',
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
    description: 'List directory contents (excludes common build/cache directories)',
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
    description: 'Search for files by name pattern or content recursively',
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
    name: 'run_command',
    description: 'Execute a shell command and return its output. Includes timeout protection to prevent hanging. Use for: running tests, checking versions, installing packages, building projects, git operations, etc.',
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
        }
      },
      required: ['command']
    }
  }
];
