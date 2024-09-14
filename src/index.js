import { convertDirectory } from './converter.js';
import prompts from 'prompts';
import path from 'path';
import os from 'os';

async function main() {
  const response = await prompts({
    type: 'text',
    name: 'directory',
    message: 'Enter the directory path to convert:'
  });

  let dirPath = response.directory;

  // Expand ~ to home directory
  if (dirPath.startsWith('~')) {
    dirPath = path.join(os.homedir(), dirPath.slice(1));
  }

  // Resolve relative paths
  dirPath = path.resolve(dirPath);

  await convertDirectory(dirPath);
  console.log('Conversion completed successfully!');
}

main().catch(console.error);

