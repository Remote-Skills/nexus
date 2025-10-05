import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Risk assessment for commands
const HIGH_RISK_PATTERNS = [
  // Destructive operations
  /^(rm|del|rmdir|rd)\s/i,
  /^format\s/i,
  /--force/i,
  /--hard/i,
  
  // System modifications  
  /^(chmod|chown|sudo|su)\s/i,
  /^(systemctl|service)\s/i,
  
  // Network operations
  /^(curl|wget|ssh|scp|rsync)\s/i,
  
  // Package installations
  /^(npm\s+(install|i)|pip\s+install|apt\s+(install|remove)|yum\s+(install|remove))/i,
  
  // Git operations affecting remote
  /git\s+(push|force-push)/i,
  /git\s+push.*--force/i,
  
  // Database operations
  /^(mysql|psql|mongo)\s/i,
  /drop\s+(table|database)/i,
  
  // Docker operations
  /^docker\s+(run|exec|rm|rmi)/i,
  /^docker-compose\s+(up|down)/i
];

const MEDIUM_RISK_PATTERNS = [
  // Package management (safe operations)
  /^npm\s+(run|test|build|start)/i,
  /^pip\s+(list|show|freeze)/i,
  
  // Git operations (local)
  /^git\s+(add|commit|checkout|branch|merge)/i,
  
  // File operations (non-destructive)
  /^(mkdir|touch|cp|copy|mv|move)\s/i
];

function assessCommandRisk(command: string): 'low' | 'medium' | 'high' {
  const cmd = command.trim();
  
  // Check for high-risk patterns
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(cmd)) {
      return 'high';
    }
  }
  
  // Check for medium-risk patterns
  for (const pattern of MEDIUM_RISK_PATTERNS) {
    if (pattern.test(cmd)) {
      return 'medium';
    }
  }
  
  return 'low';
}

function getRiskDescription(command: string): string {
  const cmd = command.toLowerCase();
  
  if (cmd.includes('rm ') || cmd.includes('del ')) {
    return '- Delete files or directories permanently\n- Data loss if used incorrectly';
  }
  if (cmd.includes('chmod') || cmd.includes('chown')) {
    return '- Modify file permissions or ownership\n- Could affect system security';
  }
  if (cmd.includes('sudo') || cmd.includes('su ')) {
    return '- Execute with elevated privileges\n- Full system access';
  }
  if (cmd.includes('curl') || cmd.includes('wget')) {
    return '- Download files from the internet\n- Potential security risks from external sources';
  }
  if (cmd.includes('install')) {
    return '- Install new packages or software\n- Could modify system or introduce vulnerabilities';
  }
  if (cmd.includes('git push')) {
    return '- Push changes to remote repository\n- Could overwrite or affect shared code';
  }
  if (cmd.includes('format')) {
    return '- Format drives or partitions\n- Complete data loss on target';
  }
  
  return '- Potentially dangerous operation\n- Review command carefully before approval';
}

function formatCommandOutput(stdout: string, stderr: string, showFull: boolean, maxChars: number): string {
  let output = '';
  
  // Add stdout if present
  if (stdout && stdout.trim()) {
    if (showFull || stdout.length <= maxChars / 2) {
      output += `📤 OUTPUT:\n${stdout}\n`;
    } else {
      // Show last 50 lines for large outputs
      const lines = stdout.split('\n');
      if (lines.length > 50) {
        const lastLines = lines.slice(-50);
        output += `📤 OUTPUT (last 50 lines of ${lines.length}):\n${lastLines.join('\n')}\n`;
      } else {
        output += `📤 OUTPUT:\n${stdout}\n`;
      }
    }
  }
  
  // Add stderr if present (always show full stderr for debugging)
  if (stderr && stderr.trim()) {
    output += `⚠️ STDERR:\n${stderr}\n`;
  }
  
  // Final truncation if still too long
  if (!showFull && output.length > maxChars) {
    const truncated = output.substring(0, maxChars);
    const lastNewline = truncated.lastIndexOf('\n');
    if (lastNewline > maxChars * 0.8) {
      output = truncated.substring(0, lastNewline) + 
        `\n\n📝 Output truncated (${output.length} chars total, showing ${lastNewline})`;
    } else {
      output = truncated + `\n\n📝 Output truncated (${output.length} chars total)`;
    }
  }
  
  return output;
}

const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', '.svn', '__pycache__', '.venv', 'venv', 'env',
  'dist', 'build', '.next', '.nuxt', '.cache', '.parcel-cache', 'coverage',
  '.pytest_cache', '.mypy_cache', '.tox', '.eggs', '*.egg-info', 
  '.idea', '.vscode', '.DS_Store', 'Thumbs.db'
]);

function shouldExcludePath(filePath: string): boolean {
  const parts = filePath.split(path.sep);
  return parts.some(part => EXCLUDED_DIRS.has(part) || part.startsWith('.'));
}

export async function createFile(args: { path: string; content: string }): Promise<string> {
  try {
    const dir = path.dirname(args.path);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(args.path, args.content, 'utf-8');
    return `File created successfully: ${args.path}`;
  } catch (error: any) {
    throw new Error(`Failed to create file: ${error.message}`);
  }
}

export async function readFile(args: {
  path: string;
  start_line?: number;
  end_line?: number;
  preview_only?: boolean;
  search_term?: string;
  max_chars?: number;
}): Promise<string> {
  try {
    const content = await fs.readFile(args.path, 'utf-8');
    const maxChars = args.max_chars || 10000;
    
    // Preview mode
    if (args.preview_only) {
      return content.substring(0, 500) + (content.length > 500 ? '...\n(Use full read for complete content)' : '');
    }
    
    // Search mode
    if (args.search_term) {
      const lines = content.split('\n');
      const matches = lines
        .map((line, idx) => ({ line, num: idx + 1 }))
        .filter(({ line }) => line.toLowerCase().includes(args.search_term!.toLowerCase()));
      
      if (matches.length === 0) {
        return `No matches found for "${args.search_term}"`;
      }
      
      return `Found ${matches.length} matches:\n\n` + 
        matches.map(({ line, num }) => `Line ${num}: ${line}`).join('\n');
    }
    
    // Line range mode
    if (args.start_line || args.end_line) {
      const lines = content.split('\n');
      const start = (args.start_line || 1) - 1;
      const end = args.end_line || lines.length;
      const selectedLines = lines.slice(start, end);
      return selectedLines.join('\n');
    }
    
    // Full read with limit
    if (content.length > maxChars) {
      const stats = await fs.stat(args.path);
      const sizeKB = Math.round(stats.size / 1024);
      return `File is large (${sizeKB}KB). Showing first ${maxChars} characters:\n\n` +
        content.substring(0, maxChars) + 
        '\n\n... (truncated, use line ranges for specific sections)';
    }
    
    return content;
  } catch (error: any) {
    throw new Error(`Failed to read file: ${error.message}`);
  }
}

export async function editFile(args: {
  path: string;
  old_text?: string;
  new_text: string;
  mode: 'replace' | 'append';
}): Promise<string> {
  try {
    const content = await fs.readFile(args.path, 'utf-8');
    
    if (args.mode === 'append') {
      await fs.writeFile(args.path, content + args.new_text, 'utf-8');
      return `Content appended to ${args.path}`;
    }
    
    if (args.mode === 'replace') {
      if (!args.old_text) {
        throw new Error('old_text required for replace mode');
      }
      
      if (!content.includes(args.old_text)) {
        throw new Error('old_text not found in file');
      }
      
      const newContent = content.replace(args.old_text, args.new_text);
      await fs.writeFile(args.path, newContent, 'utf-8');
      return `Content replaced in ${args.path}`;
    }
    
    throw new Error('Invalid mode');
  } catch (error: any) {
    throw new Error(`Failed to edit file: ${error.message}`);
  }
}

export async function deleteFile(args: { path: string }): Promise<string> {
  try {
    const stats = await fs.stat(args.path);
    
    if (stats.isDirectory()) {
      await fs.rm(args.path, { recursive: true, force: true });
      return `Directory deleted: ${args.path}`;
    } else {
      await fs.unlink(args.path);
      return `File deleted: ${args.path}`;
    }
  } catch (error: any) {
    throw new Error(`Failed to delete: ${error.message}`);
  }
}

export async function listFiles(args: {
  path?: string;
  recursive?: boolean;
}): Promise<string> {
  try {
    const dirPath = args.path || process.cwd();
    const results: string[] = [];
    
    async function scan(dir: string, prefix = '') {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (shouldExcludePath(fullPath)) {
          continue;
        }
        
        if (entry.isDirectory()) {
          results.push(`${prefix}📁 ${entry.name}/`);
          if (args.recursive) {
            await scan(fullPath, prefix + '  ');
          }
        } else {
          const stats = await fs.stat(fullPath);
          const sizeKB = Math.round(stats.size / 1024);
          results.push(`${prefix}📄 ${entry.name} (${sizeKB}KB)`);
        }
      }
    }
    
    await scan(dirPath);
    return results.length > 0 ? results.join('\n') : 'Directory is empty';
  } catch (error: any) {
    throw new Error(`Failed to list files: ${error.message}`);
  }
}

export async function smartSearch(args: {
  pattern: string;
  search_type: 'filename' | 'content';
  directory?: string;
}): Promise<string> {
  try {
    const startDir = args.directory || process.cwd();
    const results: string[] = [];
    
    async function search(dir: string) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (shouldExcludePath(fullPath)) {
            continue;
          }
          
          if (entry.isDirectory()) {
            await search(fullPath);
          } else if (args.search_type === 'filename') {
            if (entry.name.toLowerCase().includes(args.pattern.toLowerCase())) {
              results.push(fullPath);
            }
          } else if (args.search_type === 'content') {
            try {
              const content = await fs.readFile(fullPath, 'utf-8');
              if (content.toLowerCase().includes(args.pattern.toLowerCase())) {
                results.push(fullPath);
              }
            } catch {
              // Skip binary files or permission errors
            }
          }
        }
      } catch {
        // Skip directories we can't access
      }
    }
    
    await search(startDir);
    
    if (results.length === 0) {
      return `No results found for "${args.pattern}"`;
    }
    
    return `Found ${results.length} matches:\n\n${results.join('\n')}`;
  } catch (error: any) {
    throw new Error(`Search failed: ${error.message}`);
  }
}

export async function runCommand(args: {
  command: string;
  working_directory?: string;
  timeout_seconds?: number;
  max_output_chars?: number;
  approve_risky?: boolean;
  show_full_output?: boolean;
}): Promise<string> {
  try {
    const timeout = (args.timeout_seconds || 30) * 1000; // Default 30 seconds
    const maxOutputChars = args.max_output_chars || 10000;
    const cwd = args.working_directory || process.cwd();
    
    // Risk assessment
    const riskLevel = assessCommandRisk(args.command);
    if (riskLevel === 'high' && !args.approve_risky) {
      return `⚠️ HIGH-RISK COMMAND DETECTED: "${args.command}"

This command could potentially:
${getRiskDescription(args.command)}

To execute this command, you must explicitly approve it by adding 'approve_risky: true' to the command parameters.

Example:
{
  "command": "${args.command}",
  "approve_risky": true
}

Only approve if you have reviewed the command and understand the risks.`;
    }
    
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Command timed out after ${args.timeout_seconds || 30} seconds`));
      }, timeout);
    });
    
    // Execute command with timeout
    const execPromise = execAsync(args.command, {
      cwd,
      maxBuffer: 5 * 1024 * 1024, // 5MB buffer
      timeout,
      windowsHide: true, // Hide console window on Windows
    });
    
    const result = await Promise.race([execPromise, timeoutPromise]);
    
    // Format output with better structure
    let output = formatCommandOutput(result.stdout, result.stderr, args.show_full_output || false, maxOutputChars);
    
    if (!output) {
      output = '✅ Command executed successfully with no output.';
    }
    
    return `🔧 Command: ${args.command}
📁 Working Directory: ${cwd}
${riskLevel === 'high' ? '⚠️ Risk Level: HIGH (approved)\n' : ''}⏱️ Timeout: ${args.timeout_seconds || 30}s

${output}`;
    
  } catch (error: any) {
    // Handle command execution errors
    if (error.killed) {
      throw new Error(`⏰ Command was killed (timeout: ${args.timeout_seconds || 30}s)`);
    }
    
    let errorMsg = `❌ Command failed: ${args.command}\n`;
    
    if (error.stdout) errorMsg += `\nSTDOUT:\n${error.stdout}`;
    if (error.stderr) errorMsg += `\nSTDERR:\n${error.stderr}`;
    if (error.code !== undefined) errorMsg += `\nExit Code: ${error.code}`;
    
    return errorMsg; // Return error as string instead of throwing
  }
}

export async function smartReplace(args: {
  path: string;
  search_mode: 'function' | 'class' | 'method' | 'block' | 'variable';
  target: string;
  new_code: string;
  preserve_comments?: boolean;
}): Promise<string> {
  try {
    const content = await fs.readFile(args.path, 'utf-8');
    const lines = content.split('\n');
    const preserve = args.preserve_comments !== false;
    
    let result = '';
    let startLine = -1;
    let endLine = -1;
    let indentLevel = '';
    
    // Parse the file based on search mode
    switch (args.search_mode) {
      case 'function':
        result = await replaceFunctionBlock(lines, args.target, args.new_code, preserve);
        break;
      case 'class':
        result = await replaceClassBlock(lines, args.target, args.new_code, preserve);
        break;
      case 'method':
        result = await replaceMethodBlock(lines, args.target, args.new_code, preserve);
        break;
      case 'block':
        result = await replaceCodeBlock(lines, args.target, args.new_code, preserve);
        break;
      case 'variable':
        result = await replaceVariableBlock(lines, args.target, args.new_code, preserve);
        break;
      default:
        throw new Error(`Unsupported search_mode: ${args.search_mode}`);
    }
    
    // Write the modified content back to file
    await fs.writeFile(args.path, result, 'utf-8');
    
    return `Smart replacement completed successfully in ${args.path}\nMode: ${args.search_mode}\nTarget: ${args.target}`;
    
  } catch (error: any) {
    throw new Error(`Smart replace failed: ${error.message}`);
  }
}

/**
 * Replace a function block by name
 */
async function replaceFunctionBlock(lines: string[], targetName: string, newCode: string, preserveComments: boolean): Promise<string> {
  const functionPatterns = [
    new RegExp(`^\\s*(export\\s+)?(async\\s+)?function\\s+${escapeRegex(targetName)}\\s*\\(`),
    new RegExp(`^\\s*(export\\s+)?const\\s+${escapeRegex(targetName)}\\s*=\\s*(async\\s+)?\\(`),
    new RegExp(`^\\s*(export\\s+)?const\\s+${escapeRegex(targetName)}\\s*=\\s*(async\\s+)?function`),
    new RegExp(`^\\s*${escapeRegex(targetName)}\\s*:\\s*(async\\s+)?function`),
  ];
  
  for (let i = 0; i < lines.length; i++) {
    if (functionPatterns.some(pattern => pattern.test(lines[i]))) {
      const { start, end, indent } = findCodeBlockEnd(lines, i);
      return replaceBlockWithPreservation(lines, start, end, newCode, indent, preserveComments);
    }
  }
  
  throw new Error(`Function '${targetName}' not found`);
}

/**
 * Replace a class block by name
 */
async function replaceClassBlock(lines: string[], targetName: string, newCode: string, preserveComments: boolean): Promise<string> {
  const classPattern = new RegExp(`^\\s*(export\\s+)?(abstract\\s+)?class\\s+${escapeRegex(targetName)}(\\s|<|{|$)`);
  
  for (let i = 0; i < lines.length; i++) {
    if (classPattern.test(lines[i])) {
      const { start, end, indent } = findCodeBlockEnd(lines, i);
      return replaceBlockWithPreservation(lines, start, end, newCode, indent, preserveComments);
    }
  }
  
  throw new Error(`Class '${targetName}' not found`);
}

/**
 * Replace a method block by ClassName.methodName
 */
async function replaceMethodBlock(lines: string[], target: string, newCode: string, preserveComments: boolean): Promise<string> {
  const [className, methodName] = target.split('.');
  if (!className || !methodName) {
    throw new Error('Method target must be in format "ClassName.methodName"');
  }
  
  // Find the class first
  const classPattern = new RegExp(`^\\s*(export\\s+)?(abstract\\s+)?class\\s+${escapeRegex(className)}(\\s|<|{|$)`);
  let classStart = -1;
  let classEnd = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (classPattern.test(lines[i])) {
      const result = findCodeBlockEnd(lines, i);
      classStart = result.start;
      classEnd = result.end;
      break;
    }
  }
  
  if (classStart === -1) {
    throw new Error(`Class '${className}' not found`);
  }
  
  // Find the method within the class
  const methodPatterns = [
    new RegExp(`^\\s*(public|private|protected)?\\s*(static\\s+)?(async\\s+)?${escapeRegex(methodName)}\\s*\\(`),
    new RegExp(`^\\s*${escapeRegex(methodName)}\\s*:\\s*(async\\s+)?function`),
    new RegExp(`^\\s*${escapeRegex(methodName)}\\s*=\\s*(async\\s+)?\\(`),
  ];
  
  for (let i = classStart; i <= classEnd; i++) {
    if (methodPatterns.some(pattern => pattern.test(lines[i]))) {
      const { start, end, indent } = findCodeBlockEnd(lines, i);
      return replaceBlockWithPreservation(lines, start, end, newCode, indent, preserveComments);
    }
  }
  
  throw new Error(`Method '${methodName}' not found in class '${className}'`);
}

/**
 * Replace a code block starting with a specific pattern
 */
async function replaceCodeBlock(lines: string[], startPattern: string, newCode: string, preserveComments: boolean): Promise<string> {
  const pattern = new RegExp(escapeRegex(startPattern));
  
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i].trim())) {
      const { start, end, indent } = findCodeBlockEnd(lines, i);
      return replaceBlockWithPreservation(lines, start, end, newCode, indent, preserveComments);
    }
  }
  
  throw new Error(`Block starting with '${startPattern}' not found`);
}

/**
 * Replace a variable declaration
 */
async function replaceVariableBlock(lines: string[], targetName: string, newCode: string, preserveComments: boolean): Promise<string> {
  const variablePatterns = [
    new RegExp(`^\\s*(export\\s+)?(const|let|var)\\s+${escapeRegex(targetName)}\\s*[=:]`),
  ];
  
  for (let i = 0; i < lines.length; i++) {
    if (variablePatterns.some(pattern => pattern.test(lines[i]))) {
      // For variables, find the end of the declaration (semicolon or end of statement)
      let end = i;
      let indent = lines[i].match(/^\\s*/)?.[0] || '';
      
      // Handle multi-line variable declarations
      while (end < lines.length - 1) {
        if (lines[end].includes(';') || (!lines[end + 1].trim().startsWith(' ') && lines[end + 1].trim() !== '')) {
          break;
        }
        end++;
      }
      
      return replaceBlockWithPreservation(lines, i, end, newCode, indent, preserveComments);
    }
  }
  
  throw new Error(`Variable '${targetName}' not found`);
}

/**
 * Find the end of a code block (handles braces, function bodies, etc.)
 */
function findCodeBlockEnd(lines: string[], startLine: number): { start: number; end: number; indent: string } {
  const startIndent = lines[startLine].match(/^\\s*/)?.[0] || '';
  let braceCount = 0;
  let inString = false;
  let stringChar = '';
  let end = startLine;
  
  // Check if this line has an opening brace
  const hasOpenBrace = lines[startLine].includes('{');
  
  if (!hasOpenBrace) {
    // For function expressions or single-line statements, try to find logical end
    return { start: startLine, end: startLine, indent: startIndent };
  }
  
  // Count braces to find the matching closing brace
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      
      // Handle string literals
      if ((char === '"' || char === "'" || char === '`') && !inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar && inString && line[j - 1] !== '\\\\') {
        inString = false;
        stringChar = '';
      }
      
      // Count braces outside of strings
      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }
    }
    
    // If we've closed all braces, we found the end
    if (braceCount === 0 && i > startLine) {
      end = i;
      break;
    }
  }
  
  return { start: startLine, end, indent: startIndent };
}

/**
 * Replace a block while preserving comments
 */
function replaceBlockWithPreservation(lines: string[], start: number, end: number, newCode: string, indent: string, preserveComments: boolean): string {
  const before = lines.slice(0, start);
  const after = lines.slice(end + 1);
  
  // Preserve comments above the block if requested
  if (preserveComments && start > 0) {
    let commentStart = start - 1;
    while (commentStart >= 0 && (lines[commentStart].trim().startsWith('//') || lines[commentStart].trim().startsWith('/*') || lines[commentStart].trim() === '')) {
      commentStart--;
    }
    commentStart++; // Move back to first comment line
    
    if (commentStart < start) {
      // Move comments from before array to newCode
      const comments = lines.slice(commentStart, start);
      before.splice(commentStart);
      newCode = comments.join('\\n') + '\\n' + newCode;
    }
  }
  
  // Apply indentation to new code
  const indentedNewCode = newCode.split('\\n').map(line => {
    if (line.trim() === '') return line;
    return indent + line;
  }).join('\\n');
  
  return [...before, indentedNewCode, ...after].join('\\n');
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
}
