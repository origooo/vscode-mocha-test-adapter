# Mocha Test Adapter for VS Code

A comprehensive Mocha test adapter that integrates seamlessly with VS Code's native Testing API. Run, debug, and get coverage for your Mocha tests with a rich, feature-packed experience.

![VS Code Testing View](https://img.shields.io/badge/VS%20Code-Testing%20API-blue)
![Mocha](https://img.shields.io/badge/Mocha-10.x-8D6748)
![Coverage](https://img.shields.io/badge/Coverage-c8-green)

## ✨ Key Features

### 🚀 Core Testing
- **Native Testing UI** - Uses VS Code's built-in Testing API for a familiar experience
- **Automatic Discovery** - Finds `.test.{js,ts}` and `.spec.{js,ts}` files automatically
- **Run & Debug** - Execute and debug individual tests, suites, or entire files
- **Nested Suites** - Full support for nested `describe` blocks with proper hierarchy
- **TypeScript & JavaScript** - Works with both TS and JS test files seamlessly

### 📊 Enhanced Output & Diagnostics
- **Beautiful Test Output** - Color-coded results with ✓ pass, ✗ fail, ○ skip indicators
- **Test Timings** - Shows duration for each test with slow test warnings (⚠ slow)
- **Detailed Summaries** - Clear statistics showing passed, failed, skipped, and slow tests
- **Nested Suite Formatting** - Tests grouped under parent suites with proper indentation
- **Failure Grouping** - Failed tests collected at the end with detailed error info
- **Problems Integration** - Test failures appear in VS Code's Problems panel (⇧⌘M)
- **Clickable Stack Traces** - Jump directly to failing code from error messages
- **Diff Viewer** - Shows expected vs actual values for assertion failures

### 🎯 Advanced Features
- **Code Coverage** - Built-in coverage with c8, showing statement and branch coverage
- **Continuous Run** - Auto-run tests on file save with smart source-to-test mapping
- **Test Tags** - Organize tests with `@unit`, `@integration`, `@e2e` tags
- **Config File Support** - Loads `.mocharc.{js,json,yaml}` or `package.json` config
- **Hot Reload** - Config changes auto-reload tests (500ms debounce)
- **Context Menu** - Right-click actions: Go to Test, Copy Name, Run Only This, Reveal in Explorer
- **Yarn PnP Support** - Full compatibility with Yarn 2+ Plug'n'Play

## 📦 Installation

1. Install the extension from the VS Code Marketplace
2. Install Mocha and c8 in your project:

```bash
npm install --save-dev mocha c8
# or
yarn add -D mocha c8
```

3. Open the Testing view (🧪 icon in Activity Bar)
4. Tests will be automatically discovered!

## 🎬 Quick Start

### Running Tests

- **All tests**: Click ▶️ at the top of the Testing view
- **File tests**: Click ▶️ next to a test file
- **Suite tests**: Click ▶️ next to a `describe` block  
- **Single test**: Click ▶️ next to an `it` block

### Debugging

Click 🐛 instead of ▶️ to debug:
- Set breakpoints in your test code
- Step through execution
- Inspect variables

### Code Coverage

1. Click the **Coverage** button (🔬) in Testing view
2. View coverage in editor gutters (green/red lines)
3. Check detailed coverage in Test Coverage view

### Viewing Output

Click the terminal icon (�) in Testing panel to see:
- Formatted test results with suite hierarchy
- Console.log output from tests
- Detailed failure information with diffs

## 🏷️ Test Tags

Organize tests with tags for targeted test runs:

```javascript
describe('User API @integration @api', () => {
  it('should create user @smoke', () => {
    // Test code
  });
});
```

Use tag-specific profiles (Unit, Integration, E2E) to run filtered test subsets.

## ⚙️ Configuration

The extension respects your Mocha configuration files:

- `.mocharc.js`, `.mocharc.cjs`
- `.mocharc.json`, `.mocharc.jsonc`
- `.mocharc.yaml`, `.mocharc.yml`
- `mocha` section in `package.json`

Supported options include: timeout, slow, grep, bail, retries, require, and more.

Configuration changes are automatically detected and tests are rediscovered.

## 🎨 Test Output Features

### Nested Suite Formatting
```
test/example.test.ts
Running 5 tests...

Example Test Suite
  Math operations
    ✓ should add two numbers correctly (2ms)
    ✓ should multiply two numbers correctly (1ms)
  String operations
    ✓ should concatenate strings (1ms)

Test Results: 3 passing (4ms)
```

### Failure Details
```
Failed Tests:

  Math Suite > Advanced > should calculate correctly
     Expected values to be strictly equal:
     
     42 !== 41

     + expected - actual
     -42
     +41

     at Context.<anonymous> (test/math.spec.js:15:14)
```

### Slow Test Warnings
Tests exceeding the slow threshold (default 75ms) are highlighted:
```
✓ should process data ⚠ slow (150ms)
```

## 🔧 Requirements

- **VS Code**: 1.88.0 or higher
- **Mocha**: 10.x
- **c8**: 10.x (for coverage support)

## 🤝 Contributing

Found a bug or have a feature request? Please open an issue on [GitHub](https://github.com/origooo/vscode-mocha-test-adapter/issues).

## 📝 License

MIT - See [LICENSE](LICENSE) for details

## 🙏 Acknowledgments

Built with VS Code's Testing API and powered by Mocha and c8.

---

**Enjoy testing!** 🧪✨

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

### Continuous Run Mode

Enable **auto-run on save** for instant feedback during TDD:

1. Click the **continuous run button** (⏯️) in the Testing view toolbar
2. Select which profile to watch (Run Tests, Unit Tests, etc.)
3. **Save any file** → Corresponding tests automatically run after 1 second
4. **See instant results** without clicking anything
5. **Click stop** (⏹️) to disable continuous mode

**Smart File Mapping:**
- ✅ **Source files** → Automatically finds and runs corresponding test files
  - `src/math.ts` → Runs `src/math.test.ts` or `test/math.test.ts`
  - Supports multiple patterns: `*.test.ts`, `*.spec.ts`, `__tests__/*.ts`, etc.
- ✅ **Test files** → Runs the saved test file directly
- ✅ **Only changed tests run** - Saves `math.ts` → Only runs `math.test.ts`, not entire suite
- ✅ **1-second debounce** - Multiple saves within 1 second batched into single run
- ✅ **Fast unit tests shine** - Typical unit test file completes in <1 second
- ⚠️ **E2E tests disabled** - Continuous mode not available for slow E2E tests

**Perfect for:**
- Test-Driven Development (TDD) workflows
- Red-Green-Refactor cycles
- Immediate feedback when modifying implementation
- Catching regressions instantly as you code

### Configuring Test Options

You have two ways to configure Mocha options:

#### Option 1: Configuration Files (Recommended)

Create a Mocha configuration file in your project root. The extension automatically loads configuration from:

- `.mocharc.js` or `.mocharc.cjs` (JavaScript - can export a function)
- `.mocharc.json` or `.mocharc.jsonc` (JSON with comments support)
- `.mocharc.yaml` or `.mocharc.yml` (YAML - requires `yaml` or `js-yaml` package)
- `package.json` (add a `"mocha"` property)

**Example `.mocharc.js`:**
```javascript
module.exports = {
  // Test behavior
  timeout: '5s',          // Can be number (ms) or string ('5s')
  slow: 100,
  bail: false,
  retries: 2,
  allowUncaught: false,
  asyncOnly: false,
  checkLeaks: false,
  forbidOnly: false,
  forbidPending: false,
  
  // File handling
  require: ['@babel/register'],
  extension: ['ts', 'tsx'],
  recursive: true,
  ignore: ['**/.git/**', '**/node_modules/**'],
  
  // Test filtering  
  grep: 'should',         // String or RegExp
  fgrep: 'API',          // Fixed string match
  invert: false,
  
  // Parallel execution
  parallel: false,
  jobs: 4,
  
  // Reporting
  reporter: 'spec',
  inlineDiffs: true,
  color: true,
  diff: true
};
```

**Example `.mocharc.json`:**
```json
{
  "timeout": 10000,
  "slow": 100,
  "bail": false,
  "reporter": "spec",
  "inlineDiffs": true,
  "retries": 2,
  "require": ["@babel/register"],
  "extension": ["ts", "tsx"]
}
```

**Example `package.json`:**
```json
{
  "mocha": {
    "timeout": "10s",
    "slow": 100,
    "inlineDiffs": true
  }
}
```

**Configuration Priority:**
1. Command-line arguments (not applicable in VS Code context)
2. `.mocharc.js` → `.mocharc.cjs` → `.mocharc.yaml` → `.mocharc.yml` → `.mocharc.jsonc` → `.mocharc.json` → `package.json`
3. Extension defaults

**Hot-Reload:**
- Configuration files are automatically watched for changes
- When a config file changes, it's reloaded and tests are rediscovered (500ms debounce)
- If a config file is deleted, defaults are restored
- No extension reload needed!

#### Respected Configuration Properties

The extension respects the following Mocha configuration options. Configuration files are the **only** way to configure the extension (no UI-based configuration).

**✅ Fully Implemented (8 properties):**
- **`timeout`** (number | string): Test timeout in milliseconds. Supports strings like "5s". *(Default: 5000)*
- **`slow`** (number): Threshold for marking tests as slow in milliseconds. *(Default: 75)*
- **`bail`** (boolean): Stop test execution after first failure. *(Default: false)*
- **`grep`** (string | RegExp): Only run tests matching pattern. Converted to string if RegExp. *(Default: undefined)*
- **`extension`** (string[]): File extensions to consider as test files (e.g., `['ts', 'mjs', 'cjs']`). *(Default: ['js', 'ts'])*
- **`retries`** (number): Number of times to retry failed tests. Useful for flaky tests. *(Default: 0)*
- **`require`** (string[]): Modules to load before running tests (e.g., `['ts-node/register']`). *(Default: [])*
- **`ignore`** (string[]): Glob patterns to exclude from test discovery (e.g., `['**/*.helper.js']`). *(Default: [])*

**🚧 Work In Progress (9 properties):**
- **`fgrep`** (string): Fixed string match for test filtering (simpler than regex)
- **`invert`** (boolean): Invert grep/fgrep matches (exclude tests instead of include)
- **`forbidOnly`** (boolean): Fail if `.only()` tests found (CI validation)
- **`forbidPending`** (boolean): Fail if pending/skipped tests found
- **`checkLeaks`** (boolean): Check for global variable leaks between tests
- **`allowUncaught`** (boolean): Allow uncaught exceptions to propagate (debugging)
- **`asyncOnly`** (boolean): Require all tests to be async
- **`file`** (string[]): Files to load before other test files (global setup)
- **`nodeOption`** (string[]): Node.js command-line options (e.g., memory limits)

**🚫 Not Applicable (14 properties):**
These properties conflict with VS Code's Test Explorer or are redundant in an IDE context:
- **`reporter`**, **`spec`**, **`watch`**, **`watchFiles`**, **`watchIgnore`**: VS Code Test Explorer provides these features
- **`recursive`**: Extension always searches recursively
- **`parallel`**, **`jobs`**: VS Code Test Explorer manages execution
- **`ui`**: Extension only supports BDD interface (`describe`, `it`)
- **`color`**, **`diff`**, **`inlineDiffs`**, **`fullTrace`**: VS Code handles output formatting
- **`growl`**, **`delay`**, **`dryRun`**, **`failZero`**: Not relevant in IDE context
- **`delay`** (boolean): Delay root suite execution
- **`dryRun`** (boolean): Report tests without running
- **`failZero`** (boolean): Fail if no tests found
- **`nodeOption`** (string[]): Node.js options
- **`package`** (string): Path to package.json
- **`config`** (string | false): Path to config file or disable
- **`spec`** (string[]): Test file patterns (extension discovers files automatically)

**🔮 Future Implementation Priority:**
1. **`retries`** - Useful for flaky tests, easy to implement in test runner
2. **`fgrep` / `invert`** - Simple filtering additions to grep functionality  
3. **`ignore`** - Filter out specific files from test discovery
4. **`parallel`** - Significant performance improvement for large test suites
5. **`inlineDiffs` / `diff` / `color`** - Better test output formatting
6. **`reporter`** - Allow custom Mocha reporters (currently hardcoded to JSON)
7. **`forbidOnly` / `forbidPending`** - CI-friendly test validation

All configuration properties are loaded and stored by the extension, but only the "Fully Implemented" ones currently affect extension behavior. Properties marked "Not Yet Implemented" are available for future development.

#### Option 2: VS Code UI Configuration

1. Click the **dropdown arrow** next to "Run Tests" in the Testing view
2. Select **"Configure Test Profiles..."** from the menu
3. Choose which profile to configure (Run Tests, Debug Tests, etc.)
4. Enter your preferences in the dialogs:
   - **Timeout**: Maximum time for tests (default: 5000ms)
   - **Grep Pattern**: Filter tests by name (e.g., "should work" or "/pattern/")
   - **Slow Threshold**: Mark tests as slow above this duration (default: 75ms)
   - **Bail**: Stop after first test failure (useful for debugging)

**Note:** UI configuration applies to the current session only. For persistent configuration, use a config file.

Configuration file settings are loaded at startup and take precedence over defaults. UI configuration temporarily overrides both.

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
- Only 5 Mocha configuration options are fully implemented (see Configuration section for details)
- Parallel test execution not yet supported (parallel: true ignored)
- Custom Mocha reporters not supported (extension uses JSON reporter internally)
- Some configuration options like `ignore` patterns not yet applied during test discovery

## Contributing

This is an early version. Contributions, bug reports, and feature requests are welcome!

## License

MIT

## Resources

- [VS Code Testing API Documentation](https://code.visualstudio.com/api/extension-guides/testing)
- [Mocha Documentation](https://mochajs.org/)
- [Development Guide](DEVELOPMENT.md)
- [Changelog](CHANGELOG.md)

