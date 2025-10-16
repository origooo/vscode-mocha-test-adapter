# Mocha Test Adapter for VS Code

A VS Code extension that provides Mocha test integration using the native Testing API.

## Features

- **Automatic Test Discovery**: Finds `.test.ts`, `.spec.ts`, `.test.js`, and `.spec.js` files automatically
- **Native Testing UI**: Uses VS Code's built-in Testing API (not the old Test Explorer)
- **Run Individual Tests**: Execute single tests, test suites, or entire files
- **Debug Support**: Full debugging with breakpoints and source maps
- **Real-time Updates**: Watches for file changes and updates tests automatically
- **Nested Suites**: Properly handles nested `describe` blocks
- **TypeScript & JavaScript**: Supports both TS and JS test files

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

