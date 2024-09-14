import { convertDirectory } from './converter.js';
import prompts from 'prompts';
import path from 'path';
import os from 'os';

async function main() {
  try {
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
    console.log('Conversion process completed. Check the output for any reported errors.');
  } catch (error) {
    console.error('An unexpected error occurred:', error);
  }
}

main();
