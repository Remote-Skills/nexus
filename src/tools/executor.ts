import {
  createFile,
  readFile,
  editFile,
  deleteFile,
  listFiles,
  smartSearch,
  smartReplace,
  runCommand
} from './functions.js';

export async function executeTool(name: string, input: any): Promise<string> {
  // Validate inputs before execution to catch errors early
  switch (name) {
    case 'create_file':
      if (!input.path) {
        throw new Error('create_file requires "path" parameter');
      }
      if (input.content === undefined || input.content === null) {
        throw new Error('create_file requires "content" parameter. Use empty string "" for blank file.');
      }
      return await createFile(input);
    
    case 'read_file':
      if (!input.path) {
        throw new Error('read_file requires "path" parameter');
      }
      return await readFile(input);
    
    case 'edit_file':
      if (!input.path) {
        throw new Error('edit_file requires "path" parameter');
      }
      if (!input.mode) {
        throw new Error('edit_file requires "mode" parameter ("replace" or "append")');
      }
      if (input.mode !== 'replace' && input.mode !== 'append') {
        throw new Error('edit_file mode must be "replace" or "append"');
      }
      if (input.mode === 'replace' && (!input.old_text || input.old_text === '')) {
        throw new Error('edit_file in replace mode requires "old_text" parameter. Use read_file first to get the exact text you want to replace.');
      }
      // Allow missing new_text - treat as deletion (replace with empty string)
      if (input.new_text === undefined || input.new_text === null) {
        input.new_text = '';
      }
      return await editFile(input);
    
    case 'delete_file':
      if (!input.path) {
        throw new Error('delete_file requires "path" parameter');
      }
      return await deleteFile(input);
    
    case 'list_files':
      // No required parameters
      return await listFiles(input);
    
    case 'smart_search':
      if (!input.pattern) {
        throw new Error('smart_search requires "pattern" parameter');
      }
      if (!input.search_type) {
        throw new Error('smart_search requires "search_type" parameter ("filename" or "content")');
      }
      if (input.search_type !== 'filename' && input.search_type !== 'content') {
        throw new Error('smart_search search_type must be "filename" or "content"');
      }
      return await smartSearch(input);
    
    case 'smart_replace':
      if (!input.path) {
        throw new Error('smart_replace requires "path" parameter');
      }
      if (!input.search_mode) {
        throw new Error('smart_replace requires "search_mode" parameter');
      }
      if (!['function', 'class', 'method', 'block', 'variable'].includes(input.search_mode)) {
        throw new Error('smart_replace search_mode must be one of: function, class, method, block, variable');
      }
      if (!input.target) {
        throw new Error('smart_replace requires "target" parameter (name of code element to replace)');
      }
      if (input.new_code === undefined || input.new_code === null) {
        throw new Error('smart_replace requires "new_code" parameter');
      }
      return await smartReplace(input);
    
    case 'run_command':
      if (!input.command) {
        throw new Error('run_command requires "command" parameter');
      }
      // Validate timeout bounds
      if (input.timeout_seconds && (input.timeout_seconds < 1 || input.timeout_seconds > 600)) {
        throw new Error('run_command timeout_seconds must be between 1 and 600 seconds');
      }
      // Validate max output chars
      if (input.max_output_chars && input.max_output_chars < 100) {
        throw new Error('run_command max_output_chars must be at least 100');
      }
      return await runCommand(input);
    
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
