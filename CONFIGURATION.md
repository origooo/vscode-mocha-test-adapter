# Configuration Property Implementation Status

This document provides a comprehensive overview of all Mocha configuration properties and their implementation status in the VS Code Mocha Test Adapter extension.

## Table of Contents
- [Overview](#overview)
- [Implementation Status Legend](#implementation-status-legend)
- [Highly Relevant Properties (Priority Implementation)](#highly-relevant-properties-priority-implementation)
- [Somewhat Relevant Properties (Work In Progress)](#somewhat-relevant-properties-work-in-progress)
- [Not Relevant Properties (Intentionally Skipped)](#not-relevant-properties-intentionally-skipped)
- [Configuration File Support](#configuration-file-support)

## Overview

The extension loads configuration from Mocha configuration files (`.mocharc.js`, `.mocharc.json`, `.mocharc.yaml`, `package.json`) at startup. Configuration is the single source of truth - there is no UI-based configuration.

**Configuration Loading:**
- Location: `src/configLoader.ts` - Handles loading from all file formats
- Integration: `src/mochaTestController.ts` - `loadMochaConfig()` method
- Distribution: Config passed to `TestRunner` and `CoverageProvider`

**Configuration Philosophy:**
- Config files are the only way to configure the extension (no UI dialogs)
- Follows professional tool patterns (Jest, ESLint, Prettier)
- Properties are categorized by relevance to VS Code test adapter context

## Implementation Status Legend

- ✅ **Fully Implemented**: Property is loaded, validated, and actively affects extension behavior
- 🚧 **Work In Progress**: Property is planned for future implementation
- 🚫 **Not Applicable**: Property doesn't make sense in VS Code context (conflicts or redundant)

## Highly Relevant Properties (Priority Implementation)

These properties are essential for test adapters and directly affect test execution in VS Code. All are either implemented or planned for immediate implementation.

### `timeout` (number | string)
- **Status**: ✅ Fully Implemented (v0.0.6)
- **Type**: `number` (milliseconds) or `string` (e.g., "5s", "2000")
- **Default**: `5000`
- **Why Relevant**: Tests in IDEs often need different timeouts than CI
- **Implementation**: 
  - Parsed with `parseTimeout()` helper to convert strings to milliseconds
  - Passed to Mocha via `--timeout` flag
  - Applies to all test executions
- **Files**: `mochaTestController.ts`, `testRunner.ts`, `coverageProvider.ts`
- **Example**: `timeout: "10s"` or `timeout: 10000`

### `slow` (number)
- **Status**: ✅ Fully Implemented (v0.0.6)
- **Type**: `number` (milliseconds)
- **Default**: `75`
- **Why Relevant**: Visual feedback for slow tests in Test Explorer
- **Implementation**:
  - Passed to Mocha via `--slow` flag
  - Tests exceeding this threshold shown differently in UI
- **Files**: `mochaTestController.ts`, `testRunner.ts`, `coverageProvider.ts`
- **Example**: `slow: 200`

### `bail` (boolean)
- **Status**: ✅ Fully Implemented (v0.0.6)
- **Type**: `boolean`
- **Default**: `false`
- **Why Relevant**: Stop-on-first-failure is valuable during debugging
- **Implementation**:
  - When true, Mocha stops test execution after first failure
  - Passed via `--bail` flag
- **Files**: `mochaTestController.ts`, `testRunner.ts`, `coverageProvider.ts`
- **Example**: `bail: true`

### `grep` (string | RegExp)
- **Status**: ✅ Fully Implemented (v0.0.6)
- **Type**: `string` or `RegExp`
- **Default**: `undefined`
- **Why Relevant**: Filter tests by name pattern
- **Implementation**:
  - Filters tests by matching test names
  - RegExp patterns converted to string for command-line compatibility
  - Passed via `--grep` flag to Mocha
  - Also used by "Run Only This Test" context menu action
- **Files**: `mochaTestController.ts`, `testRunner.ts`, `extension.ts`
- **Example**: `grep: "should handle errors"` or `grep: /integration/`

### `extension` (string | string[])
- **Status**: ✅ Fully Implemented (v0.0.10)
- **Type**: `string[]` (normalized from string or array)
- **Default**: `['js', 'ts']`
- **Why Relevant**: Critical for discovering TypeScript, ESM, CJS test files
- **Implementation**:
  - Controls which file extensions are recognized as test files
  - Leading dots removed during normalization (`.ts` → `ts`)
  - Used in test discovery, file watching, coverage exclusions
- **Files**: `mochaTestController.ts`, `testRunner.ts`, `coverageProvider.ts`
- **Example**: `extension: ['ts', 'mjs', 'cjs']`

### `retries` (number)
- **Status**: ✅ Fully Implemented (v0.0.11)
- **Type**: `number`
- **Default**: `0`
- **Why Relevant**: Handle flaky tests during development
- **Implementation**:
  - Passed to Mocha via `--retries` flag when > 0
  - Applied in both run and debug modes
- **Files**: `mochaTestController.ts`, `testRunner.ts`
- **Example**: `retries: 2`

### `require` (string | string[])
- **Status**: ✅ Fully Implemented (v0.0.11)
- **Type**: `string[]` (normalized from string or array)
- **Default**: `[]`
- **Why Relevant**: Load transpilers (ts-node) and setup modules
- **Implementation**:
  - Modules loaded in Mocha test process context
  - Each module passed via separate `--require` flag
  - Applied in both run and debug modes
- **Files**: `mochaTestController.ts`, `testRunner.ts`
- **Example**: `require: ['ts-node/register', 'test/setup.js']`
- **Notes**: Modules loaded in test subprocess, not extension context

### `ignore` (string | string[])
- **Status**: ✅ Fully Implemented (v0.0.11)
- **Type**: `string[]` (glob patterns)
- **Default**: `[]`
- **Why Relevant**: Exclude helper files, fixtures, non-test files from discovery
- **Implementation**:
  - Patterns added to VS Code's `findFiles()` exclude parameter
  - Combined with default `**/node_modules/**` exclusion
  - Filters files during test discovery
- **Files**: `mochaTestController.ts` (lines 386-420)
- **Example**: `ignore: ['**/*.helper.js', '**/fixtures/**']`

## Somewhat Relevant Properties (Work In Progress)

These properties provide additional features that are useful in test adapters but not essential. They are documented for future implementation.

### `fgrep` (string)
- **Status**: 🚧 Work In Progress
- **Type**: `string`
- **Default**: `undefined`
- **Why Somewhat Relevant**: Simpler alternative to grep for literal string matching
- **Use Case**: Filter tests by exact name match without regex complexity
- **Implementation Plan**: Pass via `--fgrep` flag (similar to grep)
- **Example**: `fgrep: "should handle authentication"`

### `invert` (boolean)
- **Status**: 🚧 Work In Progress
- **Type**: `boolean`
- **Default**: `false`
- **Why Somewhat Relevant**: Run tests that DON'T match grep/fgrep pattern
- **Use Case**: Exclude specific test categories (e.g., run all except integration tests)
- **Implementation Plan**: Pass via `--invert` flag (works with grep/fgrep)
- **Example**: `grep: "integration", invert: true` (skip integration tests)

### `forbidOnly` (boolean)
- **Status**: 🚧 Work In Progress
- **Type**: `boolean`
- **Default**: `false`
- **Why Somewhat Relevant**: CI validation - prevent `.only()` tests from being committed
- **Use Case**: Enforce team discipline, prevent focused tests in production
- **Implementation Plan**: Pass via `--forbid-only` flag
- **Example**: `forbidOnly: true`

### `forbidPending` (boolean)
- **Status**: 🚧 Work In Progress
- **Type**: `boolean`
- **Default**: `false`
- **Why Somewhat Relevant**: CI validation - fail if skipped tests found
- **Use Case**: Ensure no tests are accidentally disabled
- **Implementation Plan**: Pass via `--forbid-pending` flag
- **Example**: `forbidPending: true`

### `checkLeaks` (boolean)
- **Status**: 🚧 Work In Progress
- **Type**: `boolean`
- **Default**: `false`
- **Why Somewhat Relevant**: Detect global variable leaks between tests
- **Use Case**: Prevent test pollution and flaky tests
- **Implementation Plan**: Pass via `--check-leaks` flag
- **Example**: `checkLeaks: true`

### `allowUncaught` (boolean)
- **Status**: 🚧 Work In Progress
- **Type**: `boolean`
- **Default**: `false`
- **Why Somewhat Relevant**: Debugging edge cases with uncaught exceptions
- **Use Case**: Debug exceptions that are hard to trace
- **Implementation Plan**: Pass via `--allow-uncaught` flag
- **Example**: `allowUncaught: true`

### `asyncOnly` (boolean)
- **Status**: 🚧 Work In Progress
- **Type**: `boolean`
- **Default**: `false`
- **Why Somewhat Relevant**: Enforce async test patterns
- **Use Case**: Ensure all tests return Promises or use callbacks
- **Implementation Plan**: Pass via `--async-only` flag
- **Example**: `asyncOnly: true`

### `file` (string | string[])
- **Status**: 🚧 Work In Progress
- **Type**: `string[]`
- **Default**: `[]`
- **Why Somewhat Relevant**: Load global setup files before tests
- **Use Case**: Shared test configuration, global fixtures
- **Implementation Plan**: Pass via `--file` flag
- **Example**: `file: ['test/setup.js', 'test/helpers.js']`

### `nodeOption` (string | string[])
- **Status**: 🚧 Work In Progress
- **Type**: `string[]`
- **Default**: `[]`
- **Why Somewhat Relevant**: Pass Node.js flags (memory limits, experimental features)
- **Use Case**: Increase heap size, enable experimental modules
- **Implementation Plan**: Pass to Node.js when spawning test process
- **Example**: `nodeOption: ['--max-old-space-size=4096', '--experimental-modules']`

## Not Relevant Properties (Intentionally Skipped)

These properties conflict with VS Code's Test Explorer functionality or are redundant in an IDE context. They will not be implemented.

### `reporter` (string)
- **Status**: 🚫 Not Applicable
- **Type**: `string`
- **Default**: `'spec'`
- **Why Not Relevant**: Extension uses JSON reporter internally for parsing test results. VS Code's Test Explorer UI replaces the need for different reporters. The Output Channel provides test output already.
- **Conflict**: VS Code Test Explorer is the reporter

### `spec` (string | string[])
- **Status**: 🚫 Not Applicable
- **Type**: `string[]` (file paths or glob patterns)
- **Default**: `[]`
- **Why Not Relevant**: VS Code's Test Explorer allows users to select which tests/files to run via UI. The extension discovers all test files automatically. This is a positional argument in Mocha CLI, not a configuration property.
- **Conflict**: VS Code Test Explorer handles test selection

### `watch` (boolean)
- **Status**: 🚫 Not Applicable
- **Type**: `boolean`
- **Default**: `false`
- **Why Not Relevant**: Extension has built-in file watching and "Continuous Run" mode. VS Code provides native file watching capabilities that integrate with the Test Explorer.
- **Conflict**: Extension implements continuous run mode

### `watchFiles` (string[])
- **Status**: 🚫 Not Applicable
- **Type**: `string[]` (glob patterns)
- **Default**: `[]`
- **Why Not Relevant**: Extension's continuous run mode automatically watches test files and source files. Custom watch patterns would conflict with this behavior.
- **Conflict**: Extension's file watching system

### `watchIgnore` (string[])
- **Status**: 🚫 Not Applicable
- **Type**: `string[]` (glob patterns)
- **Default**: `[]`
- **Why Not Relevant**: Extension's file watching system has sensible defaults (e.g., ignores `node_modules`). Additional ignore patterns not needed.
- **Conflict**: Extension's file watching system

### `recursive` (boolean)
- **Status**: 🚫 Not Applicable
- **Type**: `boolean`
- **Default**: `false`
- **Why Not Relevant**: Extension always searches recursively using `**/*` glob patterns. Non-recursive search doesn't make sense in VS Code workspace context.
- **Behavior**: Extension is always recursive

### `parallel` (boolean)
- **Status**: 🚫 Not Applicable
- **Type**: `boolean`
- **Default**: `false`
- **Why Not Relevant**: VS Code Test Explorer manages test execution and parallelism. Running tests in parallel would conflict with the Test Explorer's orchestration and result reporting.
- **Conflict**: VS Code Test Explorer manages execution
- **Note**: Future versions might support this with careful integration

### `jobs` (number)
- **Status**: 🚫 Not Applicable
- **Type**: `number`
- **Default**: `auto` (CPU cores)
- **Why Not Relevant**: Dependent on `parallel` which is not applicable. VS Code Test Explorer controls concurrency.
- **Conflict**: VS Code Test Explorer manages concurrency

### `ui` (string)
- **Status**: 🚫 Not Applicable
- **Type**: `string` (`'bdd'`, `'tdd'`, `'exports'`, `'qunit'`)
- **Default**: `'bdd'`
- **Why Not Relevant**: Extension's test discovery assumes BDD interface (`describe`, `it`). Supporting other interfaces would require completely different parsing logic. BDD is by far the most common interface.
- **Limitation**: Extension only supports BDD interface

### `color` (boolean)
- **Status**: 🚫 Not Applicable
- **Type**: `boolean`
- **Default**: `true`
- **Why Not Relevant**: VS Code Output Channel automatically handles ANSI colors. Test Explorer UI has its own styling. Color control not needed.
- **Behavior**: VS Code handles colors

### `diff` (boolean)
- **Status**: 🚫 Not Applicable
- **Type**: `boolean`
- **Default**: `true`
- **Why Not Relevant**: VS Code's Test Explorer automatically displays assertion diffs in the test results. The extension parses diff information from test failures.
- **Behavior**: Extension parses and displays diffs

### `inlineDiffs` (boolean)
- **Status**: 🚫 Not Applicable
- **Type**: `boolean`
- **Default**: `false`
- **Why Not Relevant**: Similar to `diff`, VS Code Test Explorer controls how diffs are displayed. The extension doesn't control diff formatting.
- **Behavior**: VS Code Test Explorer formats diffs

### `fullTrace` (boolean)
- **Status**: 🚫 Not Applicable
- **Type**: `boolean`
- **Default**: `false`
- **Why Not Relevant**: VS Code automatically shows full stack traces in the Test Explorer output. Users can click through stack frames to source files. Trace filtering is not needed.
- **Behavior**: VS Code shows full traces

### `growl` (boolean)
- **Status**: 🚫 Not Applicable
- **Type**: `boolean`
- **Default**: `false`
- **Why Not Relevant**: VS Code has its own notification system. Growl desktop notifications are redundant.
- **Conflict**: VS Code notifications

### `delay` (boolean)
- **Status**: 🚫 Not Applicable
- **Type**: `boolean`
- **Default**: `false`
- **Why Not Relevant**: Delays root suite execution for dynamic test generation. Not compatible with VS Code's test discovery model which expects tests to be discoverable before execution.
- **Conflict**: VS Code test discovery model

### `dryRun` (boolean)
- **Status**: 🚫 Not Applicable
- **Type**: `boolean`
- **Default**: `false`
- **Why Not Relevant**: Test discovery is a separate phase in VS Code Test Explorer. The extension discovers tests without executing them by parsing test files.
- **Behavior**: Extension discovers without execution

### `failZero` (boolean)
- **Status**: 🚫 Not Applicable
- **Type**: `boolean`
- **Default**: `false`
- **Why Not Relevant**: VS Code Test Explorer shows when no tests are found. This is a CLI-specific validation option.
- **Behavior**: VS Code shows "No tests found"

### `config` (string | false)
- **Status**: 🚫 Not Applicable
- **Type**: `string` or `false`
- **Default**: `undefined`
- **Why Not Relevant**: Extension automatically discovers config files in the workspace. Manual config path not needed.
- **Behavior**: Extension auto-discovers config

### `package` (string | false)
- **Status**: 🚫 Not Applicable
- **Type**: `string` or `false`
- **Default**: `undefined`
- **Why Not Relevant**: Extension automatically searches for `package.json` in workspace. Manual path not needed.
- **Behavior**: Extension auto-discovers package.json

## Configuration File Support

The extension supports all Mocha configuration file formats:

### Supported Formats
1. **`.mocharc.js`** / **`.mocharc.cjs`** (Priority: Highest)
   - JavaScript files with `module.exports`
   - Can export a function for dynamic configuration
   - Supports ESM with dynamic import
   - Example: `module.exports = { timeout: 5000 };`

2. **`.mocharc.yaml`** / **`.mocharc.yml`**
   - Requires `yaml` or `js-yaml` package in workspace
   - Clean, readable format
   - Example: `timeout: 5000`

3. **`.mocharc.json`** / **`.mocharc.jsonc`**
   - JSON with comments support (.jsonc)
   - Strict format validation
   - Example: `{ "timeout": 5000 }`

4. **`package.json`** (Priority: Lowest)
   - Add `"mocha"` property
   - Keep configuration with project metadata
   - Example: `{ "mocha": { "timeout": 5000 } }`

### Configuration Loading Priority
1. `.mocharc.js` (highest)
2. `.mocharc.cjs`
3. `.mocharc.yaml`
4. `.mocharc.yml`
5. `.mocharc.jsonc`
6. `.mocharc.json`
7. `package.json` (lowest)

### Implementation Details
- **File**: `src/configLoader.ts`
- **Class**: `ConfigLoader`
- **Methods**:
  - `loadConfig()` - Main entry point, searches for config files
  - `loadJavaScriptConfig()` - Loads .js/.cjs files
  - `loadJsonConfig()` - Loads .json/.jsonc files (strips comments)
  - `loadYamlConfig()` - Loads .yaml/.yml files
  - `loadFromPackageJson()` - Loads from package.json

## Contributing

When implementing a new configuration property:

1. Verify it's already in `MochaConfigFile` interface (`src/configLoader.ts`)
2. Add it to `MochaConfig` interface if needed (`src/mochaTestController.ts`, `src/testRunner.ts`)
3. Implement the logic in appropriate files
4. Pass to Mocha command-line if applicable
5. Update this documentation with implementation details
6. Update README.md configuration section
7. Add to CHANGELOG.md
8. Write tests if complex logic involved

## References

- [Mocha Configuration Documentation](https://mochajs.org/#configuring-mocha-nodejs)
- [Mocha Command-Line Options](https://mochajs.org/#command-line-usage)
- Extension ConfigLoader: `src/configLoader.ts`
- Extension Config Usage: `src/mochaTestController.ts`
