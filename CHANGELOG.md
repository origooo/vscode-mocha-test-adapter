# Changelog

All notable changes to the "Mocha Test Adapter" extension will be documented in this file.

## [0.0.15] - 2025-10-17

### Added
- **Failure Grouping in Summary**: Detailed failure report at end of test run
  - Failed tests grouped by suite for easier navigation
  - Each failure numbered sequentially (1), 2), 3), etc.)
  - Suite path shown inline with test name for context (e.g., "Suite > Test")
  - Full error messages displayed with dimmed formatting
  - Expected vs Actual comparison for assertion failures
  - Stack traces included (first 3 frames) for debugging
  - Makes it easy to review all failures without scrolling through output
  - Perfect for fixing multiple test failures in one session

### Fixed
- **File-Specific Test Results**: Fixed issue where Mocha config caused all test files to run together
  - Test file path now placed at end of args to override config spec patterns
  - Failures now only appear in their own file's output
  - Test statistics accurate for each individual file
  - Filters test results to match only TestItems from current file
  - Resolves duplicate failure reports across multiple test files
- **Multi-word Suite Names**: Fixed suite name splitting in output formatting
  - Suite names with spaces no longer split into multiple levels
  - Uses TestItem hierarchy directly instead of parsing fullTitle
  - Preserves original suite structure from test discovery
- **Test Run Header**: Added file path to test output header
  - Shows relative path from workspace root
  - Displayed in cyan and bright for visibility
  - Helps identify which file is being tested in multi-file runs

### Technical Details
- Created `formatFailureDetails()` method to collect and format failures
- Added filtering logic to match tests against TestItems in current file
- Moved test file path to end of Mocha args array for precedence
- Uses `formatTestResultsWithTestItems()` to leverage existing TestItem structure
- Filters `testResults` Map before calculating stats for accuracy
- Improved failure detail formatting with inline suite context

## [0.0.14] - 2025-10-17

### Added
- **Nested Suite Output Formatting**: Enhanced test output with better visual hierarchy
  - Suite headers displayed with proper indentation and structure
  - Tests grouped under their parent suites for better organization
  - Uses TestItem hierarchy for accurate multi-word suite names
  - Cleaner, more readable output in Test Results panel
  - Recursive suite formatting shows full test structure at a glance
  - Pending tests (○), passed tests (✓), and failed tests (✗) all properly nested
  - Makes it easier to understand test organization and context

### Technical Details
- Created `formatTestResultsWithTestItems()` method using TestItem structure
- Walks TestItem hierarchy to format output with proper nesting
- Formats output with proper indentation (2 spaces per level)
- Suite names displayed in bright white for visibility
- Replaced dual spec/JSON reporter approach with single JSON reporter + custom formatting
- More efficient: only one Mocha execution instead of two

## [0.0.13] - 2025-10-17

### Added
- **Test Timing Thresholds**: Automatic detection and highlighting of slow tests
  - Tests exceeding the slow threshold display a yellow `⚠ slow` indicator
  - Uses Mocha's `slow` configuration option (default: 75ms)
  - Configurable via `.mocharc.json`, `.mocharc.js`, or `package.json`
  - Slow test count included in summary: "X passing, Y failing, Z skipped, W slow"
  - Only counts passed tests as slow (failed tests already highlighted)
  - Helps identify performance issues during TDD workflows
  - Duration displayed in yellow for slow tests to draw attention

### Technical Details
- Updated `formatTestResult()` to detect tests with `duration > config.slow`
- Added slow indicator: `${this.colors.yellow}⚠ slow${this.colors.reset}`
- Modified `calculateStats()` to count slow tests separately
- Updated `formatTestSummary()` to display slow test count in summary
- Duration formatting changes to yellow color for slow tests

## [0.0.12] - 2025-10-17

### Added
- **Error Diagnostics Integration**: Failed tests now appear in the Problems panel (⇧⌘M)
  - Test failures show up alongside ESLint, TypeScript, and other diagnostics
  - Click on problem entries to jump directly to the failing test
  - Diagnostics include test name and error message with source location
  - Automatically cleared at the start of each test run
  - Cleared for specific files when all tests in that file pass
  - Provides unified view of all code issues in one place
  - Perfect for TDD workflows - treat test failures as "problems to fix"

### Fixed
- **Test Discovery for `.skip()` Modifiers**: Properly hide tests and suites with `.skip()`
  - Fixed `describe.skip()` to hide entire suite and all nested tests
  - Fixed `it.skip()` to hide individual tests
  - Updated regex patterns to capture `.skip()` and `.only()` modifiers
  - Skipped tests are completely excluded from Test Explorer during discovery
  - Matches Mocha's CLI behavior where skipped tests don't appear in output
  - Tests inside `describe.skip()` blocks are also properly hidden
- **Duplicate Node Arguments**: Fixed TypeScript compilation errors in test execution
  - Removed duplicate `NODE_OPTIONS` environment variable that was causing issues
  - Node arguments (`--require`, `--experimental-loader`) now passed only once in command args
  - Fixes "Cannot find name 'describe'" and similar TypeScript errors
  - Improves reliability of PnP loader and TypeScript transpilation

### Technical Details
- Created `DiagnosticsProvider` class to manage VS Code diagnostic collection
- Added `addTestFailure()` method with stack trace parsing for precise location
- Added `clearFileDignostics()` to clear diagnostics when tests pass
- Integrated diagnostics into test result update flow
- Updated test discovery regex to capture modifiers: `/(describe|context)(\.(skip|only))?\s*\(/`
- Added indentation-based tracking for skipped describe blocks
- Fixed node argument passing to prevent duplication in spawn() calls

## [0.0.11] - 2025-10-16

### Removed
- **UI Configuration Handler**: Removed "Configure Test Profiles" menu and configuration dialogs
  - Configuration files are now the **only** way to configure Mocha options
  - Eliminates confusion about which settings apply (UI vs file)
  - Follows professional tool patterns (Jest, ESLint, Prettier all use config files)
  - Deleted `showConfigurationDialog()` method (~65 lines)
  - Removed `configureHandler` from all 6 test profiles (run, debug, unit, integration, e2e, coverage)

### Added
- **`retries` Configuration**: Retry failed tests N times before marking as failure
  - Useful for handling flaky tests during development
  - Passed to Mocha via `--retries` flag when > 0
  - Applied in both run and debug modes
  - Example: `retries: 2` in `.mocharc.js`
- **`require` Configuration**: Full implementation for loading modules before tests
  - Load transpilers like `ts-node/register`, `@babel/register`
  - Load global setup files, assertion libraries, test utilities
  - Each module passed via separate `--require` flag to Mocha
  - Applied in both run and debug modes
  - Example: `require: ['ts-node/register', 'test/setup.js']`
- **`ignore` Configuration**: Exclude files from test discovery
  - Glob patterns to exclude helper files, fixtures, non-test files
  - Patterns added to VS Code's `findFiles()` exclude parameter
  - Combined with default `**/node_modules/**` exclusion
  - Example: `ignore: ['**/*.helper.js', '**/fixtures/**']`
- **Configuration Hot-Reload**: Automatically reload config when files change
  - Watches all config files (`.mocharc.*`, `package.json`)
  - 500ms debounce to prevent excessive reloads during rapid edits
  - Automatically rediscovers tests when config changes (e.g., new extensions, ignore patterns)
  - Reverts to defaults if config file is deleted
  - No extension reload needed!
- **Enhanced Test Output**: Improved test run output with colors and statistics
  - Color-coded test results: ✓ green for pass, ✗ red for fail, ○ yellow for skipped
  - Test duration display for individual tests (e.g., "15ms", "1.23s")
  - Test run header showing total test count
  - Summary statistics at end: "X passing, Y failing, Z skipped (total duration)"
  - Skipped/pending test detection and proper status marking
  - ANSI color support for better readability in Test Results panel
- **Skipped Test Handling**: Proper support for `.skip()` modifier
  - `it.skip()` tests are hidden from Test Explorer (not discovered)
  - `describe.skip()` suites are hidden from Test Explorer (including all child tests)
  - Tests within `describe.skip()` blocks that don't have `.skip()` are also hidden
  - Matches Mocha's behavior where skipped tests don't appear in test results

### Changed
- **Documentation Reorganization**: Updated CONFIGURATION.md with property relevance categories
  - **Highly Relevant (8 properties)**: Fully implemented - timeout, slow, bail, grep, extension, retries, require, ignore
  - **Somewhat Relevant (9 properties)**: Documented as work-in-progress for future implementation
  - **Not Relevant (14 properties)**: Documented why they're intentionally skipped (conflict with VS Code or redundant)
  - Clear rationale for each category explaining VS Code Test Explorer integration
- **README.md**: Updated configuration documentation to reflect file-only configuration approach

### Fixed
- **JavaScript Config Loading**: Fixed `.mocharc.js` and `.mocharc.cjs` loading in ESM contexts
  - Use `createRequire()` from Node.js `module` to properly load CommonJS config files
  - `.cjs` files now use `require()` directly (no dynamic import attempt)
  - `.js` files try ESM import first, fall back to require
  - Helpful error messages when config syntax conflicts with package.json `"type": "module"`

### Technical Details
- Updated `MochaConfig` interface in all 3 modules (mochaTestController, testRunner, coverageProvider)
- Added retries, require, ignore properties with proper types
- Config loading in `loadMochaConfig()` normalizes arrays (string|string[] → string[])
- Test runner builds Mocha arguments with new flags in both `runFileTests()` and `debugTests()`
- Test discovery filters files using ignore patterns in `discoverAllTests()` method
- Comprehensive logging when config properties are loaded
- Config file watchers created in `setupConfigFileWatcher()` with shared debounce timer
- Import `createRequire` from `module` for proper CommonJS loading in ESM extension context
- Added output formatting methods: `formatDuration()`, `formatTestSummary()`, `formatTestResult()`, `calculateStats()`
- ANSI color codes defined for terminal output (green/red/yellow/cyan with reset/dim/bright modifiers)
- Test results now include `pending` flag for skipped tests
- JSON reporter parsing detects `test.pending === true` and `results.pending` array
- Skipped tests properly marked with `run.skipped()` instead of passed/failed
- Statistics calculation counts passed/failed/skipped separately
- Test discovery regex patterns updated to match `.skip()` and `.only()` modifiers
- `describe.skip()` blocks completely excluded from test tree (hidden from Test Explorer)
- `it.skip()` tests completely excluded from test tree (hidden from Test Explorer)
- Skipped tests within skipped suites are not shown in Test Explorer (matching Mocha behavior)

## [0.0.10] - 2025-10-16

### Added
- **Extension Configuration Respect**: All test-related operations now respect the `extension` config option
  - File watchers use configured extensions (e.g., `['js', 'ts', 'mjs', 'cjs']`)
  - Test discovery patterns generated dynamically based on config
  - Continuous run mode detects test files using configured extensions
  - Source-to-test file mapping searches across all configured extensions
  - Coverage exclusions apply to all configured test file extensions
  - Defaults to `['js', 'ts']` matching Mocha's defaults
  - Example: Set `extension: ['mjs', 'cjs']` in `.mocharc.js` to work with ES modules

### Technical Details
- Added `extensions` field to `MochaConfig` interfaces across all modules
- Created `getTestFilePatterns()` method to generate dynamic glob patterns like `**/*.test.{ts,js}`
- Created `isTestFileUri()` method for URI validation against configured extensions
- Updated `setupFileWatchers()` to use dynamic patterns
- Updated `discoverAllTests()` to use dynamic patterns
- Updated continuous run mode file detection in `handleFileChange()`
- Updated `findTestFilesForSource()` to search for test files in all configured extensions
- Updated coverage provider to generate dynamic exclusion patterns
- Extensions normalized by removing leading dots (`.ts` → `ts`)
- Logging added when extensions are loaded from config

## [0.0.9] - 2025-10-16

### Added
- **Configuration File Support**: Automatically loads Mocha configuration from workspace files
  - Supports `.mocharc.js`, `.mocharc.cjs` (JavaScript with function support)
  - Supports `.mocharc.json`, `.mocharc.jsonc` (JSON with comments)
  - Supports `.mocharc.yaml`, `.mocharc.yml` (YAML - requires `yaml` or `js-yaml` package)
  - Supports `package.json` with `"mocha"` property
  - Priority order follows Mocha's official spec
  - Loaded at startup and applied to all test runs
  - **Complete option support**: All Mocha CLI options are supported including:
    - Test behavior: `timeout`, `slow`, `bail`, `retries`, `allowUncaught`, `asyncOnly`, `checkLeaks`, `forbidOnly`, `forbidPending`, etc.
    - File handling: `require`, `extension`, `ignore`, `recursive`, `watch`, `watchFiles`, `watchIgnore`, etc.
    - Test filtering: `grep`, `fgrep`, `invert`
    - Parallel execution: `parallel`, `jobs`
    - Reporting: `reporter`, `inlineDiffs`, `color`, `diff`, `fullTrace`, `reporterOptions`, etc.
    - Interface: `ui`
    - And many more standard Mocha options
  - Smart type handling: Converts string timeouts (e.g., "5s") to milliseconds, RegExp to string for grep
  - UI configuration still available for session-specific overrides

### Technical Details
- Created `ConfigLoader` class to handle all config file formats
- Complete `MochaConfigFile` interface with all Mocha options
- Loads config during `initialize()` before test discovery
- Merges config with defaults, respecting option priorities
- Uses dynamic import for ESM/CJS compatibility with `.mocharc.js` files
- JSONC support via comment stripping
- YAML support if parser available in workspace
- `parseTimeout()` helper converts string timeouts to numbers
- Type-safe handling of RegExp grep patterns
- Updates runner and coverage provider with loaded settings

## [0.0.8] - 2025-10-16

### Added
- **Context Menu Actions**: Right-click on any test for quick actions
  - **Go to Test**: Navigate directly to test code location (also available via ⌘+Click)
  - **Copy Test Name**: Copy full hierarchical test name to clipboard
  - **Run Only This Test**: Run just this specific test in isolation using grep
  - **Reveal in Explorer**: Show test file in VS Code file explorer
  - Commands appear in context menu with appropriate icons
  - Helpful for navigating large test suites and debugging specific tests

### Technical Details
- Registered four new commands in package.json with menu contributions
- `getFullTestName()` helper builds hierarchical test paths
- `runTestWithGrep()` temporarily sets grep pattern for isolated test execution
- Uses VS Code icons: `go-to-file`, `clippy`, `play`, `file-directory`
- Commands integrate seamlessly with native Testing API context menus

## [0.0.7] - 2025-10-16

### Added
- **Continuous Run Mode**: Auto-run tests on file save with smart source-to-test mapping
  - Click the continuous run button (⏯️) to activate
  - **Source file saves** → Automatically finds and runs corresponding test files
    - `src/math.ts` → Runs `src/math.test.ts`, `test/math.test.ts`, etc.
    - Supports patterns: `*.test.*`, `*.spec.*`, `__tests__/*.*, `test/`, `tests/`, etc.
  - **Test file saves** → Runs the saved test file directly
  - Smart performance: Only runs changed test files, not entire suite
  - 1-second debounce to batch rapid saves
  - Enabled for Run Tests, Unit Tests, and Integration Tests profiles
  - Disabled for E2E tests (too slow for continuous mode)
  - Perfect for TDD workflows with instant feedback on implementation changes

### Technical Details
- Set `supportsContinuousRun: true` on relevant profiles
- Implemented `findTestFilesForSource()` to map source files to test files
- Watches both source files (`.ts`, `.js`, `.tsx`, `.jsx`) and test files
- Uses `vscode.workspace.onDidSaveTextDocument` for file change detection
- Async file existence checks for test file pattern matching
- Graceful cancellation handling with cleanup

## [0.0.6] - 2025-10-16

### Changed
- **BREAKING**: Removed `mocha` and `c8` as extension dependencies
  - Users must now install `mocha` and `c8` in their workspace
  - Extension discovers these dependencies automatically
  - Shows helpful error messages if dependencies are missing
  - Prevents version conflicts and allows users to choose their versions

### Fixed
- Documentation clarification: Configure handlers are accessed via "Configure Test Profiles..." in the dropdown menu, not a gear icon
- Added configure handlers to all profiles including tag-specific and coverage profiles
- Improved error messages when Mocha or c8 are not installed

## [0.0.5] - 2025-10-16

### Added
- **Configure Handler**: Configure Mocha options via UI dialog
  - Timeout setting with validation
  - Grep pattern for filtering tests by name
  - Slow threshold configuration
  - Bail option to stop after first failure
  - Accessible via "Configure Test Profiles..." in the run profile dropdown
  - Configuration persists during session and applies to all test runs
  - Settings affect regular runs, debug sessions, and coverage runs
  - Available for all profiles including tag-specific profiles

### Technical Details
- Implemented `configureHandler` on all test run profiles
- Added `MochaConfig` interface shared across runner and coverage provider
- Configuration passed as command-line arguments to Mocha
- Settings validated with input validation callbacks

## [0.0.4] - 2025-10-16

### Added
- **Test Tags**: Organize and filter tests using tags
  - Support for `[tag]` and `@tag` syntax in test names
  - Tag inheritance from parent describe blocks to child tests
  - Tag-specific run profiles: "Run Unit Tests", "Run Integration Tests", "Run E2E Tests"
  - Tests with tags only appear under their matching profile (e.g., `@unit` tests only run in "Run Unit Tests")
  - Prevents accidental execution of slow tests during unit test runs
- **Improved Test Output**: Changed to spec reporter for clean, formatted terminal output
  - No more raw JSON in Test Results terminal
  - Clean checkmarks and crosses for pass/fail
  - Human-readable test output with proper indentation
  - Still parses JSON in background for accurate test status

### Technical Details
- Implemented tag extraction from test names using regex patterns
- Created `TestTag` objects for filtering and organization
- Modified test runner to use spec reporter for display + json reporter for parsing
- Tests now run twice sequentially for optimal UX and accurate results
- Added `collectTestsWithTag()` to recursively filter tests by tag
- Added `countTests()` for accurate test counting in logging

## [0.0.3] - 2025-10-16

### Added
- **Test Output Capture**: All test output is now captured and displayed in the Test Results view
  - Console.log statements appear in the output terminal
  - Mocha execution output is preserved with ANSI colors
  - Access output via the terminal icon in Testing panel
- **Enhanced Error Messages**: Failed tests now show rich error information
  - Stack traces with clickable file links to jump to error location
  - Expected vs. Actual diffs for assertion failures
  - Full error context from Mocha with proper formatting

### Technical Details
- Implemented `run.appendOutput()` for test output streaming
- Created enhanced `TestMessage` objects with stack traces and diffs
- Added stack trace parsing to extract file locations and line numbers
- Proper handling of expected/actual values for assertion libraries

## [0.0.2] - 2025-10-16

### Added
- **Code Coverage Support**: Integrated c8 for comprehensive code coverage
  - Run tests with coverage via the Coverage profile in Test Explorer
  - View coverage percentages in the Test Coverage view
  - See detailed statement and function coverage in editor gutters
  - Automatic cleanup of temporary coverage files
- **Improved Test Result Matching**: Fixed test pass/fail detection to properly check the `err` property from Mocha's JSON reporter
- **Better Logging**: Enhanced output channel logging to show test result details and coverage information

### Fixed
- Test results now correctly display pass/fail status in VS Code UI
- Fixed test matching logic to properly build full test paths for accurate result association
- Fixed TestCoverageCount to use (covered, total) instead of (covered, uncovered)

## [0.0.1] - 2025-10-16

### Added
- Initial release
- Automatic test discovery for `.test.ts`, `.spec.ts`, `.test.js`, and `.spec.js` files
- Integration with VS Code's native Testing API
- Support for running individual tests, test suites, and all tests
- Debug support with full source maps
- Real-time test discovery as files change
- File system watching for automatic test updates
- Command to manually refresh tests
- Support for nested `describe` blocks (test suites)
- TypeScript and JavaScript test file support
- Mocha test framework integration
- Yarn 4 Plug'n'Play (PnP) support

### Technical Details
- Built with TypeScript using ESM modules
- Uses Yarn 4 with Plug'n'Play (PnP) for dependency management
- Configured with ESLint (flat config), Prettier, and TypeScript
- Full debugging support with source maps
- Implements VS Code Testing API (not the deprecated Test Explorer UI)

## Future Enhancements

Potential features for future releases:
- Test configuration UI
- Support for `.mocharc.json` configuration files
- Custom Mocha reporter options
- Test output formatting
- Performance improvements for large test suites
- Better error messages and diagnostics
- Support for test tags/filters
