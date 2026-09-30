import { readFile, writeFile } from 'node:fs/promises';

const filename = new URL('../css/workspace.css', import.meta.url);
const source = await readFile(filename, 'utf8');
const lines = [];
let buffer = '', indent = 0, quote = null, parentheses = 0, previous = '';
const flush = () => {
  if (buffer.trim()) lines.push('  '.repeat(indent) + buffer.trim());
  buffer = '';
};
for (const char of source) {
  if (quote) {
    buffer += char;
    if (char === quote && previous !== '\\') quote = null;
  } else if (char === '"' || char === "'") { quote = char; buffer += char; }
  else if (char === '(') { parentheses++; buffer += char; }
  else if (char === ')') { parentheses--; buffer += char; }
  else if (!parentheses && char === '{') { buffer = buffer.trimEnd() + ' {'; flush(); indent++; }
  else if (!parentheses && char === '}') { flush(); indent--; lines.push('  '.repeat(indent) + '}'); }
  else if (!parentheses && char === ';') { buffer += char; flush(); }
  else if (char === '\n' || char === '\r') { if (buffer.trim()) buffer += ' '; }
  else buffer += char;
  previous = char;
}
flush();
await writeFile(filename, lines.map(line => line.trimEnd().endsWith('{')
  ? line.replace(/:\s+/g, ':')
  : line.replace(/^(\s*[\w-]+):\s*/, '$1: ').replace(/\s+;/g, ';')).join('\n') + '\n');
console.log('CSS 已格式化，便于逐项阅读。');
