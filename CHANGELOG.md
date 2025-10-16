# Changelog

All notable changes to the "Mocha Test Adapter" extension will be documented in this file.

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
