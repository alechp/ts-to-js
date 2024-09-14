import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { parse, print } from 'recast';
import { transformFromAstSync } from '@babel/core';
import transformTypescript from '@babel/plugin-transform-typescript';
import getBabelOptions from 'recast/parsers/_babel_options.js';
import { parser } from 'recast/parsers/babel.js';

export async function convertDirectory(dirPath) {
  const files = await glob('**/*.{ts,tsx,astro}', { cwd: dirPath, ignore: await getIgnorePatterns(dirPath) });

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    await convertFile(filePath);
  }

  await removeEnvDTs(dirPath);
  await convertJsConfigToTsConfig(dirPath);
}

async function convertFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const ast = parse(content, {
    parser: {
      parse: (source, options) => {
        const babelOptions = getBabelOptions(options);
        babelOptions.plugins.push('typescript', 'jsx');
        return parser.parse(source, babelOptions);
      }
    }
  });

  const options = {
    cloneInputAst: false,
    code: false,
    ast: true,
    plugins: [transformTypescript],
    configFile: false
  };

  const { ast: transformedAST } = transformFromAstSync(ast, content, options);
  const result = print(transformedAST).code;

  const newFilePath = filePath.replace(/\.ts(x)?$/, '.js$1');
  await fs.writeFile(newFilePath, result);

  if (filePath !== newFilePath) {
    await fs.unlink(filePath);
  }
}

async function removeEnvDTs(dirPath) {
  const envDtsFiles = await glob('**/env.d.ts', { cwd: dirPath });
  for (const file of envDtsFiles) {
    await fs.unlink(path.join(dirPath, file));
  }
}

async function convertJsConfigToTsConfig(dirPath) {
  const jsConfigFiles = await glob('**/jsconfig.json', { cwd: dirPath });
  for (const file of jsConfigFiles) {
    const filePath = path.join(dirPath, file);
    const content = await fs.readFile(filePath, 'utf-8');
    const tsConfigPath = path.join(path.dirname(filePath), 'tsconfig.json');
    await fs.writeFile(tsConfigPath, content);
    await fs.unlink(filePath);
  }
}

async function getIgnorePatterns(dirPath) {
  try {
    const gitignorePath = path.join(dirPath, '.gitignore');
    const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
    return gitignoreContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  } catch (error) {
    console.warn('No .gitignore file found. Proceeding without ignore patterns.');
    return [];
  }
}
