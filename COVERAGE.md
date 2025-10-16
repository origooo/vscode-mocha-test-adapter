# Code Coverage Guide

This extension includes built-in code coverage support using [c8](https://github.com/bcoe/c8), the modern coverage tool for Node.js with full ESM and TypeScript support.

## How to Use Coverage

### Running Tests with Coverage

1. **Open the Testing View**: Click the beaker 🧪 icon in VS Code's Activity Bar
2. **Select Coverage Profile**: Instead of clicking "Run Tests", click the dropdown next to the play button
3. **Choose "Run with Coverage"**: This will execute your tests and collect coverage data
4. **View Results**: Coverage information appears in multiple places:
   - **Test Coverage Panel**: Shows overall coverage percentages per file
   - **Editor Gutters**: Green/red highlighting on covered/uncovered lines
   - **Inline Details**: Hover over gutters for execution counts

### Understanding Coverage Metrics

The extension reports three types of coverage:

- **Statement Coverage**: Percentage of statements executed during tests
- **Branch Coverage**: Percentage of conditional branches taken (if/else, switch, etc.)
- **Function/Declaration Coverage**: Percentage of functions that were called

### Coverage Output

Coverage data is temporarily stored in your system's temp directory and automatically cleaned up when:
- You close the Test Results panel
- VS Code signals it no longer needs the test run data
- The extension is deactivated

## Technical Details

### How It Works

1. **Test Execution**: When you run with coverage, the extension:
   - Spawns `c8` as a wrapper around Node.js
   - Runs Mocha tests inside the instrumented environment
   - Outputs coverage data in JSON format

2. **Coverage Collection**: c8 generates:
   - `coverage-summary.json`: High-level stats per file
   - `coverage-final.json`: Detailed line/branch/function data

3. **VS Code Integration**: The extension:
   - Parses coverage JSON files
   - Creates `FileCoverage` objects for the Testing API
   - Provides detailed coverage via `loadDetailedCoverage()`
   - Displays results in VS Code's native UI

### Configuration

c8 is configured with these defaults:
- **Reporters**: JSON (for parsing) + text (for logs)
- **Excluded Patterns**:
  - `**/*.test.{js,ts}` - Test files themselves
  - `**/*.spec.{js,ts}` - Spec files
  - `**/node_modules/**` - Dependencies
- **Include All Files**: Tracks coverage for all source files, even those not imported by tests

### Customization

To customize c8 behavior, edit `src/coverageProvider.ts` and modify the `c8Args` array:

```typescript
const c8Args = [
  ...nodeArgs,
  path.join(workspacePath, 'node_modules', 'c8', 'bin', 'c8.js'),
  '--reporter=json',           // Keep for VS Code integration
  '--reporter=text',           // Optional: console output
  `--reports-dir=${coverageDir}`,
  '--all',                     // Include all files
  '--exclude=**/*.test.{js,ts}',  // Add more exclusions as needed
  // Add your custom c8 options here
  mochaPath,
  testFilePath,
  // ... mocha args
];
```

For all c8 options, see: https://github.com/bcoe/c8#readme

## Troubleshooting

### Coverage not showing

1. **Check the Output Channel**:
   - Open **View → Output**
   - Select **"Mocha Tests"** from dropdown
   - Look for coverage-related errors

2. **Verify c8 is installed**:
   ```bash
   yarn list c8
   ```

3. **Check temp directory permissions**: Coverage files are written to `os.tmpdir()`

### Coverage seems incorrect

- **Source maps**: Ensure your `tsconfig.json` has `"sourceMap": true`
- **Compilation**: Coverage is measured on compiled JS, not original TS
- **Exclusions**: Check that your source files aren't accidentally excluded

### Performance issues

Coverage collection adds overhead. For large projects:
- Run coverage only when needed (not every test run)
- Exclude unnecessary files using c8's `--exclude` patterns
- Consider running coverage on specific test files rather than the entire suite

## Best Practices

1. **Run Regularly**: Make coverage part of your testing workflow
2. **Set Goals**: Aim for meaningful coverage (80%+ is common)
3. **Focus on Critical Paths**: 100% coverage isn't always necessary
4. **Review Uncovered Code**: Use coverage to find untested edge cases
5. **Don't Game Metrics**: Write tests for quality, not just coverage numbers

## VS Code Coverage API

This extension uses VS Code's native Testing API coverage features:

- **`TestRunProfile.kind = Coverage`**: Creates a coverage-specific run profile
- **`TestRun.addCoverage()`**: Adds file-level coverage summaries
- **`FileCoverage`**: Represents coverage for a single file
- **`StatementCoverage`**: Detailed statement execution counts
- **`DeclarationCoverage`**: Function/method coverage with names
- **`loadDetailedCoverage()`**: Lazy-loads detailed data when user views a file

For more information, see: https://code.visualstudio.com/api/extension-guides/testing#test-coverage
