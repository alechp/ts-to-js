# TS-to-JS Converter

This project provides a tool to convert TypeScript projects to JavaScript, with a focus on Astro projects.

## Features

- Converts `.ts` and `.tsx` files to `.js`
- Handles Astro-specific files (`.astro`)
- Converts `tsconfig.json` to `jsconfig.json`
- Removes TypeScript-specific syntax and type annotations
- Converts ES6 imports to CommonJS requires

## Prerequisites

- Node.js (v14 or later)
- Bun

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/your-username/ts-to-js-converter.git
   ```

2. Navigate to the project directory:
   ```
   cd ts-to-js-converter
   ```

3. Install dependencies:
   ```
   bun install
   ```

## Usage

1. Run the conversion script:
   ```
   bun run start
   ```

2. When prompted, enter the full path to the directory you want to convert.

3. The script will process all TypeScript files in the specified directory and its subdirectories.

4. After conversion, check the output for any reported errors or warnings.

## Test Script (`test.sh`)

The `test.sh` script is provided to automate the testing process. It performs the following steps:

1. Sets up logging to track the execution process.
2. Cleans up and unzips a sample project in a sandbox directory.
3. Runs the TS-to-JS conversion script on the sample project.
4. Installs dependencies in the converted project.
5. Attempts to run the development server of the converted project.

To use the test script:

1. Make sure you have the necessary permissions:
   ```
   chmod +x test.sh
   ```

2. Run the script:
   ```
   ./test.sh
   ```

Note: You may need to modify the paths in the script to match your local environment.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
