import {
  createFile,
  readFile,
  editFile,
  deleteFile,
  listFiles,
  smartSearch,
  runCommand
} from './functions.js';

export async function executeTool(name: string, input: any): Promise<string> {
  switch (name) {
    case 'create_file':
      return await createFile(input);
    
    case 'read_file':
      return await readFile(input);
    
    case 'edit_file':
      return await editFile(input);
    
    case 'delete_file':
      return await deleteFile(input);
    
    case 'list_files':
      return await listFiles(input);
    
    case 'smart_search':
      return await smartSearch(input);
    
    case 'run_command':
      return await runCommand(input);
    
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
