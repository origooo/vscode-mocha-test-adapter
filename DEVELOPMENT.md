# Development Guide

## Project Structure

```
copilot-mocha-extension/
├── src/
│   ├── extension.ts           # Extension entry point
│   ├── mochaTestController.ts # Main test controller
│   ├── testDiscovery.ts       # Test discovery logic
│   └── testRunner.ts          # Test execution logic
├── .vscode/
│   ├── launch.json            # Debug configuration
│   ├── tasks.json             # Build tasks
│   └── settings.json          # Workspace settings
├── dist/                      # Compiled output
├── package.json
├── tsconfig.json
└── eslint.config.js
```

## Key Features

- **Native VS Code Testing API**: Uses the new `vscode.tests` API (not the old Test Explorer UI)
- **Automatic Test Discovery**: Finds `.test.ts`, `.spec.ts`, `.test.js`, and `.spec.js` files
- **Real-time Updates**: Watches for file changes and updates tests automatically
- **Run & Debug Support**: Full debugging support with source maps
- **ESM Modules**: Uses modern ES modules throughout
- **Yarn 4 PnP**: Zero-install dependency management

## Getting Started

### 1. Install Dependencies

Dependencies are already installed with Yarn 4 PnP. If you need to reinstall:

```bash
yarn install
```

### 2. Setup VS Code TypeScript

The Yarn SDK has been configured. If prompted by VS Code, select "Allow" to use the workspace TypeScript version.

### 3. Build the Extension

```bash
yarn compile
```

Or watch for changes:

```bash
yarn watch
```

### 4. Run the Extension

Press **F5** in VS Code, or:

1. Open the Run and Debug view (⇧⌘D)
2. Select "Run Extension"
3. Click the green play button

This will:
- Compile the TypeScript code
- Launch a new VS Code Extension Development Host window
- Load your extension

### 5. Test the Extension

In the Extension Development Host window:

1. Open a folder with Mocha tests (or create a new test file)
2. Open the Testing view (click the beaker icon in the Activity Bar)
3. Your tests should appear automatically
4. Click the play button next to a test to run it
5. Click the debug icon to debug a test

## Using the Extension

### Test File Patterns

The extension discovers test files matching these patterns:
- `**/*.test.ts`
- `**/*.spec.ts`
- `**/*.test.js`
- `**/*.spec.js`

### Example Test File

See `example.test.ts` for a working example:

```typescript
import { describe, it } from 'mocha';
import * as assert from 'assert';

describe('Example Test Suite', () => {
  it('should pass', () => {
    assert.strictEqual(2 + 2, 4);
  });
});
```

### Running Tests

- **Run all tests**: Click the play button at the top of the Testing view
- **Run a test file**: Click the play button next to the file
- **Run a test suite**: Click the play button next to a `describe` block
- **Run a single test**: Click the play button next to an `it` block

### Debugging Tests

- Click the debug icon (instead of play) next to any test
- Set breakpoints in your test code
- Use the Debug Console for evaluation

### Refreshing Tests

If tests don't appear, use the command palette (⇧⌘P):
- Run "Mocha: Refresh Tests"

## Architecture

### Extension Flow

1. **Activation** (`extension.ts`)
   - Creates the `TestController`
   - Initializes file watchers
   - Registers commands

2. **Test Discovery** (`testDiscovery.ts`)
   - Scans workspace for test files
   - Parses test structure (describe/it blocks)
   - Creates `TestItem` hierarchy
   - Updates on file changes

3. **Test Execution** (`testRunner.ts`)
   - Creates Mocha instances
   - Runs tests and captures results
   - Reports results to VS Code Testing API
   - Handles debugging sessions

### VS Code Testing API

The extension uses these key APIs:

- `vscode.tests.createTestController()` - Create the test controller
- `controller.createTestItem()` - Create test items (files, suites, tests)
- `controller.createRunProfile()` - Register run/debug profiles
- `controller.createTestRun()` - Start a test run
- `run.passed()` / `run.failed()` - Report test results

## Development Workflow

### Making Changes

1. Edit source files in `src/`
2. The watch task will recompile automatically (if running)
3. Press **Reload Window** (⇧⌘P → "Developer: Reload Window") in the Extension Development Host

### Debugging the Extension

The extension itself can be debugged:

1. Set breakpoints in your extension code
2. Press F5 to start debugging
3. Breakpoints will hit when the extension executes

### Code Quality

**Lint your code:**
```bash
yarn lint
```

**Auto-fix lint issues:**
```bash
yarn lint:fix
```

**Format code:**
```bash
yarn format
```

**Check formatting:**
```bash
yarn format:check
```

## Troubleshooting

### TypeScript Errors in VS Code

If you see red squiggles for module imports:

1. Press ⇧⌘P
2. Run "TypeScript: Select TypeScript Version"
3. Choose "Use Workspace Version"

### Tests Not Appearing

1. Check the Output panel (View → Output)
2. Select "Mocha Tests" from the dropdown
3. Look for error messages

Or refresh manually:
```
⇧⌘P → "Mocha: Refresh Tests"
```

### Compilation Errors

Clear the dist folder and rebuild:
```bash
rm -rf dist
yarn compile
```

### Yarn PnP Issues

Reinstall dependencies:
```bash
yarn install
```

Regenerate SDK:
```bash
yarn dlx @yarnpkg/sdks vscode
```

## Publishing

To package the extension:

```bash
yarn vsce package
```

This creates a `.vsix` file that can be installed in VS Code.

## Next Steps

- Add support for code coverage (see VS Code Testing API docs)
- Implement test configuration UI
- Add support for Mocha options (.mocharc.json)
- Improve test parsing for edge cases
- Add more test lifecycle events

## Resources

- [VS Code Testing API](https://code.visualstudio.com/api/extension-guides/testing)
- [Mocha Documentation](https://mochajs.org/)
- [Yarn 4 Documentation](https://yarnpkg.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
