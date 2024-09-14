import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { parser } from 'recast/parsers/babel.js';
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

export async function convertDirectory(dirPath) {
  const files = await glob('**/*.{ts,tsx,astro,json}', { cwd: dirPath, ignore: await getIgnorePatterns(dirPath) });
  const errors = [];

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    try {
      const { content, newFilePath } = await convertFile(filePath);
      await fs.writeFile(newFilePath, content, 'utf8');
      if (newFilePath !== filePath) {
        await fs.unlink(filePath);
      }
      console.log(`Successfully converted: ${filePath} -> ${newFilePath}`);
    } catch (error) {
      console.error(`Error converting ${filePath}: ${error.message}`);
      errors.push({ file: filePath, error: error.message });
    }
  }

  await removeEnvDTs(dirPath);
  await convertTsConfigToJsConfig(dirPath);
  await renameRemainingTsFiles(dirPath);

  if (errors.length > 0) {
    console.error('\nConversion completed with errors:');
    errors.forEach(({ file, error }) => {
      console.error(`  ${file}: ${error}`);
    });
  } else {
    console.log('\nAll files converted successfully!');
  }
}

async function convertFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  let newContent = content;
  let newFilePath = filePath.replace(/\.tsx?$/, '.js');

  try {
    if (filePath.endsWith('tsconfig.json')) {
      newContent = content.replace(/"compilerOptions"/, '"compilerOptions"')
        .replace(/"strict":\s*true/, '"checkJs": true');
      newFilePath = path.join(path.dirname(filePath), 'jsconfig.json');
    } else if (filePath.endsWith('.astro')) {
      // Handle .astro files
      const parts = content.split('---');
      if (parts.length >= 3) {
        const frontmatter = parts[1];
        const template = parts.slice(2).join('---');
        const convertedFrontmatter = await convertAstroFrontmatter(frontmatter);
        newContent = `---\n${convertedFrontmatter}\n---\n${template}`;
      }
      // Convert require to import in the entire file
      newContent = newContent.replace(/const\s+(\w+)\s*=\s*require\(([^)]+)\);?/g, 'import $1 from $2;');
    } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      // Handle .ts and .tsx files
      const ast = parser.parse(content, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx', 'importAssertions'],
      });

      traverse(ast, {
        ImportDeclaration(path) {
          // Convert import statements
          const specifiers = path.node.specifiers;
          const source = path.node.source.value;

          if (specifiers.length === 0) {
            // Side-effect import, leave as is
            return;
          }

          const defaultSpecifier = specifiers.find(s => t.isImportDefaultSpecifier(s));
          const namedSpecifiers = specifiers.filter(s => t.isImportSpecifier(s));

          if (defaultSpecifier && namedSpecifiers.length === 0) {
            // Default import only
            path.replaceWith(
              t.variableDeclaration('const', [
                t.variableDeclarator(
                  defaultSpecifier.local,
                  t.callExpression(
                    t.identifier('require'),
                    [t.stringLiteral(source)]
                  )
                )
              ])
            );
          } else if (namedSpecifiers.length > 0) {
            // Named imports (with or without default)
            const objectPattern = t.objectPattern(
              namedSpecifiers.map(s =>
                t.objectProperty(
                  t.identifier(s.imported.name),
                  t.identifier(s.local.name),
                  false,
                  s.imported.name === s.local.name
                )
              )
            );

            let declaration;
            if (defaultSpecifier) {
              declaration = t.variableDeclaration('const', [
                t.variableDeclarator(
                  t.objectPattern([
                    t.objectProperty(
                      t.identifier('default'),
                      defaultSpecifier.local
                    ),
                    t.restElement(objectPattern)
                  ]),
                  t.callExpression(
                    t.identifier('require'),
                    [t.stringLiteral(source)]
                  )
                )
              ]);
            } else {
              declaration = t.variableDeclaration('const', [
                t.variableDeclarator(
                  objectPattern,
                  t.callExpression(
                    t.identifier('require'),
                    [t.stringLiteral(source)]
                  )
                )
              ]);
            }

            path.replaceWith(declaration);
          }
        },
        ExportDefaultDeclaration(path) {
          // Convert export default to module.exports
          path.replaceWith(
            t.expressionStatement(
              t.assignmentExpression(
                '=',
                t.memberExpression(
                  t.identifier('module'),
                  t.identifier('exports')
                ),
                path.node.declaration
              )
            )
          );
        },
        ExportNamedDeclaration(path) {
          // Convert named exports to module.exports.x = x
          if (path.node.declaration) {
            if (t.isVariableDeclaration(path.node.declaration)) {
              const declarations = path.node.declaration.declarations;
              const exportStatements = declarations.map(d =>
                t.expressionStatement(
                  t.assignmentExpression(
                    '=',
                    t.memberExpression(
                      t.memberExpression(
                        t.identifier('module'),
                        t.identifier('exports')
                      ),
                      t.identifier(d.id.name)
                    ),
                    t.identifier(d.id.name)
                  )
                )
              );
              path.replaceWithMultiple([
                path.node.declaration,
                ...exportStatements
              ]);
            } else if (t.isFunctionDeclaration(path.node.declaration) || t.isClassDeclaration(path.node.declaration)) {
              const name = path.node.declaration.id.name;
              path.replaceWithMultiple([
                path.node.declaration,
                t.expressionStatement(
                  t.assignmentExpression(
                    '=',
                    t.memberExpression(
                      t.memberExpression(
                        t.identifier('module'),
                        t.identifier('exports')
                      ),
                      t.identifier(name)
                    ),
                    t.identifier(name)
                  )
                )
              ]);
            }
          } else if (path.node.specifiers) {
            const exportStatements = path.node.specifiers.map(s =>
              t.expressionStatement(
                t.assignmentExpression(
                  '=',
                  t.memberExpression(
                    t.memberExpression(
                      t.identifier('module'),
                      t.identifier('exports')
                    ),
                    t.identifier(s.exported.name)
                  ),
                  t.identifier(s.local.name)
                )
              )
            );
            path.replaceWithMultiple(exportStatements);
          }
        },
        CallExpression(path) {
          if (path.node.callee.name === 'require') {
            // Convert require to import
            const importSpecifier = t.importDefaultSpecifier(path.parent.id);
            const importDeclaration = t.importDeclaration(
              [importSpecifier],
              t.stringLiteral(path.node.arguments[0].value)
            );
            path.parentPath.parentPath.replaceWith(importDeclaration);
          }
        },
        VariableDeclaration(path) {
          if (path.node.declarations[0].init &&
            path.node.declarations[0].init.type === 'CallExpression' &&
            path.node.declarations[0].init.callee.name === 'require') {
            // Handle const { x, y } = require('module') case
            const moduleSpecifier = path.node.declarations[0].init.arguments[0].value;
            const importSpecifiers = path.node.declarations[0].id.properties.map(prop =>
              t.importSpecifier(t.identifier(prop.key.name), t.identifier(prop.key.name))
            );
            const importDeclaration = t.importDeclaration(importSpecifiers, t.stringLiteral(moduleSpecifier));
            path.replaceWith(importDeclaration);
          }
        },
        TSTypeAnnotation(path) {
          // Remove type annotations
          path.remove();
        },
        TSTypeParameterDeclaration(path) {
          // Remove generic type parameters
          path.remove();
        },
        TSInterfaceDeclaration(path) {
          // Remove interface declarations
          path.remove();
        },
        TSTypeAliasDeclaration(path) {
          // Remove type aliases
          path.remove();
        },
        TSAsExpression(path) {
          // Remove type assertions
          path.replaceWith(path.node.expression);
        },
        TSParameterProperty(path) {
          // Convert parameter properties to regular parameters
          path.replaceWith(t.identifier(path.node.parameter.name));
        },
        TSNonNullExpression(path) {
          // Remove non-null assertions
          path.replaceWith(path.node.expression);
        },
      });

      newContent = generate(ast, {}, content).code;
    }
  } catch (error) {
    console.error(`Error converting file ${filePath}: ${error.message}`);
    // If there's an error, we'll keep the original content but still change the extension for .ts files
  }

  return { content: newContent, newFilePath };
}

async function convertAstroFrontmatter(frontmatter) {
  try {
    const ast = parser.parse(frontmatter, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });

    traverse(ast, {
      ImportDeclaration(path) {
        // Convert import statements in frontmatter
        const specifiers = path.node.specifiers;
        const source = path.node.source.value;

        if (specifiers.length === 0) {
          // Side-effect import, leave as is
          return;
        }

        const defaultSpecifier = specifiers.find(s => t.isImportDefaultSpecifier(s));
        const namedSpecifiers = specifiers.filter(s => t.isImportSpecifier(s));

        if (defaultSpecifier && namedSpecifiers.length === 0) {
          // Default import only
          path.replaceWith(
            t.variableDeclaration('const', [
              t.variableDeclarator(
                defaultSpecifier.local,
                t.callExpression(
                  t.identifier('require'),
                  [t.stringLiteral(source)]
                )
              )
            ])
          );
        } else if (namedSpecifiers.length > 0) {
          // Named imports (with or without default)
          const objectPattern = t.objectPattern(
            namedSpecifiers.map(s =>
              t.objectProperty(
                t.identifier(s.imported.name),
                t.identifier(s.local.name),
                false,
                s.imported.name === s.local.name
              )
            )
          );

          let declaration;
          if (defaultSpecifier) {
            declaration = t.variableDeclaration('const', [
              t.variableDeclarator(
                t.objectPattern([
                  t.objectProperty(
                    t.identifier('default'),
                    defaultSpecifier.local
                  ),
                  t.restElement(objectPattern)
                ]),
                t.callExpression(
                  t.identifier('require'),
                  [t.stringLiteral(source)]
                )
              )
            ]);
          } else {
            declaration = t.variableDeclaration('const', [
              t.variableDeclarator(
                objectPattern,
                t.callExpression(
                  t.identifier('require'),
                  [t.stringLiteral(source)]
                )
              )
            ]);
          }

          path.replaceWith(declaration);
        }
      },
      CallExpression(path) {
        if (path.node.callee.name === 'require') {
          // Convert require to import
          const importSpecifier = t.importDefaultSpecifier(path.parent.id);
          const importDeclaration = t.importDeclaration(
            [importSpecifier],
            t.stringLiteral(path.node.arguments[0].value)
          );
          path.parentPath.parentPath.replaceWith(importDeclaration);
        }
      },
      VariableDeclaration(path) {
        if (path.node.declarations[0].init &&
          path.node.declarations[0].init.type === 'CallExpression' &&
          path.node.declarations[0].init.callee.name === 'require') {
          // Handle const { x, y } = require('module') case
          const moduleSpecifier = path.node.declarations[0].init.arguments[0].value;
          const importSpecifiers = path.node.declarations[0].id.properties.map(prop =>
            t.importSpecifier(t.identifier(prop.key.name), t.identifier(prop.key.name))
          );
          const importDeclaration = t.importDeclaration(importSpecifiers, t.stringLiteral(moduleSpecifier));
          path.replaceWith(importDeclaration);
        }
      },
      // We don't handle exports in frontmatter as they're not typical
      TSTypeAnnotation(path) {
        // Remove type annotations
        path.remove();
      },
      TSTypeParameterDeclaration(path) {
        // Remove generic type parameters
        path.remove();
      },
      TSInterfaceDeclaration(path) {
        // Remove interface declarations
        path.remove();
      },
      TSTypeAliasDeclaration(path) {
        // Remove type aliases
        path.remove();
      },
      TSAsExpression(path) {
        // Remove type assertions
        path.replaceWith(path.node.expression);
      },
      TSParameterProperty(path) {
        // Convert parameter properties to regular parameters
        path.replaceWith(t.identifier(path.node.parameter.name));
      }
    });

    return generate(ast, {}, frontmatter).code;
  } catch (error) {
    console.error(`Error converting Astro frontmatter: ${error.message}`);
    return frontmatter; // Return original frontmatter if conversion fails
  }
}

async function removeEnvDTs(dirPath) {
  const envDtsFiles = await glob('**/env.d.ts', { cwd: dirPath });
  for (const file of envDtsFiles) {
    await fs.unlink(path.join(dirPath, file));
  }
}

async function convertTsConfigToJsConfig(dirPath) {
  const tsConfigFiles = await glob('**/tsconfig.json', { cwd: dirPath });
  for (const file of tsConfigFiles) {
    const filePath = path.join(dirPath, file);
    const content = await fs.readFile(filePath, 'utf-8');
    const jsConfigPath = path.join(path.dirname(filePath), 'jsconfig.json');
    const newContent = content.replace(/"compilerOptions"/, '"compilerOptions"')
      .replace(/"strict":\s*true/, '"checkJs": true');
    await fs.writeFile(jsConfigPath, newContent);
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

async function renameRemainingTsFiles(dirPath) {
  const tsFiles = await glob('**/*.ts', { cwd: dirPath });
  for (const file of tsFiles) {
    const oldPath = path.join(dirPath, file);
    const newPath = oldPath.replace(/\.ts$/, '.js');
    await fs.rename(oldPath, newPath);
    console.log(`Renamed: ${oldPath} -> ${newPath}`);
  }
}

export {
  convertFile,
  convertAstroFrontmatter
};
