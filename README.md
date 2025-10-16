# Mocha Test Adapter for VS Code

A VS Code extension that provides Mocha test integration using the native Testing API.

## Features

- **Automatic Test Discovery**: Finds `.test.ts`, `.spec.ts`, `.test.js`, and `.spec.js` files automatically
- **Native Testing UI**: Uses VS Code's built-in Testing API (not the old Test Explorer)
- **Run Individual Tests**: Execute single tests, test suites, or entire files
- **Debug Support**: Full debugging with breakpoints and source maps
- **Code Coverage**: Built-in coverage support with detailed statement and branch coverage
- **Test Output**: Captures and displays console.log() and test output in Test Results view
- **Enhanced Error Messages**: Shows stack traces with clickable file links and diffs for assertion failures
- **Test Tags**: Organize and filter tests by tags (unit, integration, e2e, etc.)
- **Configurable Test Options**: Configure Mocha timeout, grep patterns, slow threshold, and bail via UI
- **Real-time Updates**: Watches for file changes and updates tests automatically
- **Nested Suites**: Properly handles nested `describe` blocks
- **TypeScript & JavaScript**: Supports both TS and JS test files
- **Yarn PnP Support**: Works with Yarn 2+ Plug'n'Play

## Quick Start

1. Open a workspace containing Mocha tests
2. Open the Testing view (click the beaker 🧪 icon in the Activity Bar)
3. Tests will be automatically discovered
4. Click the ▶️ play button to run tests
5. Click the 🐛 debug icon to debug tests

## Requirements

- VS Code 1.85.0 or higher
- Mocha tests in your workspace

## Usage

### Running Tests

- **All tests**: Click the play button at the top of the Testing view
- **File tests**: Click play next to a test file
- **Suite tests**: Click play next to a `describe` block  
- **Single test**: Click play next to an `it` block

### Debugging Tests

Click the debug icon (🐛) instead of play:
- Set breakpoints in your test code
- Step through test execution
- Inspect variables in the Debug Console

### Code Coverage

Run tests with coverage to see which parts of your code are tested:

1. **Run with Coverage**: Click the **Coverage** button (🔬) in the Testing view instead of Run
2. **View Coverage**: After tests complete, coverage will be displayed:
   - **Editor gutters**: Green/red highlighting shows covered/uncovered lines
   - **Test Coverage view**: Shows coverage percentages per file
   - **Detailed view**: Expand files to see statement and function coverage details
3. **Coverage Files**: Temporary coverage data is automatically cleaned up after viewing

The extension uses [c8](https://github.com/bcoe/c8) for coverage collection, which provides accurate coverage for both JavaScript and TypeScript with full ESM support.

### Viewing Test Output

When tests run, their output is captured and displayed:

1. **Test Results View**: Click the terminal icon (📺) in the Testing panel to view test output
2. **Console Logs**: Any `console.log()` statements in your tests will appear in the output
3. **Mocha Output**: Test execution details and summaries are displayed
4. **ANSI Colors**: Colored output is preserved for better readability

### Enhanced Error Messages

When tests fail, you get detailed information:

- **Stack Traces**: Clickable links to the exact line where the error occurred
- **Assertion Diffs**: For failed assertions, see expected vs. actual values side-by-side
- **Error Context**: Full error messages with all details from Mocha

Click on any stack trace line to jump directly to that location in your code.

### Test Tags

Organize your tests using tags to run specific subsets of tests:

**Tagging Tests**:
Use `[tag]` or `@tag` syntax in test names:
```typescript
describe('[unit] Math utilities', () => {
  it('@slow should calculate factorial', () => {
    // Test code
  });
});

describe('@integration API tests', () => {
  it('[e2e] should handle full workflow', () => {
    // Test code
  });
});
```

**Running Tagged Tests**:
The extension creates separate run profiles for different tags:
1. Click the dropdown arrow next to the Run button in the Testing view
2. Select a tag-specific profile:
   - **Run Unit Tests** - Only runs tests tagged with `[unit]` or `@unit`
   - **Run Integration Tests** - Only runs `@integration` tests
   - **Run E2E Tests** - Only runs `[e2e]` tests
3. Only tests with matching tags will execute

**How It Works**:
- Tests with `[unit]` or `@unit` tags can ONLY be run via the "Run Unit Tests" profile
- Tests without tags can be run with the default "Run Tests" profile
- VS Code's Testing API ensures tests only appear under their matching profiles
- This prevents accidentally running slow integration/e2e tests during unit test runs

**Common Tags**:
- `unit` - Fast, isolated unit tests
- `integration` - Integration tests with external dependencies
- `e2e` - End-to-end tests
- `slow` - Tests that take longer to run

**Tag Inheritance**: Tests automatically inherit tags from their parent `describe` blocks.

### Configuring Test Options

To configure Mocha options:

1. Click the **dropdown arrow** next to "Run Tests" in the Testing view
2. Select **"Configure Test Profiles..."** from the menu
3. Choose which profile to configure (Run Tests, Debug Tests, etc.)
4. Enter your preferences in the dialogs:
   - **Timeout**: Maximum time for tests (default: 5000ms)
   - **Grep Pattern**: Filter tests by name (e.g., "should work" or "/pattern/")
   - **Slow Threshold**: Mark tests as slow above this duration (default: 75ms)
   - **Bail**: Stop after first test failure (useful for debugging)

Configuration applies to all test runs until changed. Settings are remembered during your session.

### Manual Refresh

If tests don't appear, open the Command Palette (⇧⌘P on Mac, Ctrl+Shift+P on Windows/Linux) and run:
```
Mocha: Refresh Tests
```

### Viewing Logs

The extension logs all activity to an output channel:

1. Open the Output panel: **View → Output** (or ⇧⌘U on Mac, Ctrl+Shift+U on Windows/Linux)
2. Select **"Mocha Tests"** from the dropdown
3. You'll see detailed logs of:
   - Extension activation
   - Test discovery
   - File watching events
   - Test execution
   - Errors and stack traces

This is helpful for debugging issues or understanding what the extension is doing.

## Test File Examples

The extension recognizes standard Mocha test patterns:

```typescript
import { describe, it } from 'mocha';
import * as assert from 'assert';

describe('Math Operations', () => {
  it('should add numbers', () => {
    assert.strictEqual(2 + 2, 4);
  });

  describe('Multiplication', () => {
    it('should multiply numbers', () => {
      assert.strictEqual(3 * 4, 12);
    });
  });
});
```

## Supported Test Patterns

- `**/*.test.ts` - TypeScript test files
- `**/*.spec.ts` - TypeScript spec files  
- `**/*.test.js` - JavaScript test files
- `**/*.spec.js` - JavaScript spec files

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed development instructions.

### Building

```bash
yarn install
yarn compile
```

### Running

Press F5 in VS Code to launch the extension in debug mode.

## Technology Stack

- **TypeScript** with ESM modules
- **ESLint** with flat config (latest)
- **Prettier** for code formatting
- **Mocha** test framework
- **Yarn 4** with Plug'n'Play (PnP)

## Known Limitations

- Test parsing is based on regex patterns (may not catch all edge cases)
- Mocha configuration files (`.mocharc.json`) are not yet supported
- Code coverage is not yet implemented

## Contributing

This is an early version. Contributions, bug reports, and feature requests are welcome!

## License

MIT

## Resources

- [VS Code Testing API Documentation](https://code.visualstudio.com/api/extension-guides/testing)
- [Mocha Documentation](https://mochajs.org/)
- [Development Guide](DEVELOPMENT.md)
- [Changelog](CHANGELOG.md)

