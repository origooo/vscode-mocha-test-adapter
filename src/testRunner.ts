import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import { CoverageProvider } from './coverageProvider.js';
import { DiagnosticsProvider } from './diagnosticsProvider.js';

enum ItemType {
  File,
  Suite,
  Test,
}

interface TestData {
  type: ItemType;
  line?: number;
}

interface MochaConfig {
  timeout: number;
  grep?: string;
  slow: number;
  bail: boolean;
  retries?: number;
  require?: string[];
  ignore?: string[];
  extensions?: string[];
}

export class TestRunner {
  private config: MochaConfig = {
    timeout: 5000,
    slow: 75,
    bail: false,
    extensions: ['js', 'ts'],
  };

  constructor(
    private readonly controller: vscode.TestController,
    private readonly testData: WeakMap<vscode.TestItem, TestData>,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly diagnostics: DiagnosticsProvider,
    private readonly coverage?: CoverageProvider
  ) {}

  updateConfig(config: MochaConfig): void {
    this.config = config;
    this.outputChannel.appendLine(`Configuration updated: ${JSON.stringify(config)}`);
  }

  /**
   * Recursively collect items that have a specific tag.
   * Collects the highest-level items (file/suite) that have the tag,
   * avoiding duplicate collection of child tests.
   */
  private collectTestsWithTag(
    item: vscode.TestItem,
    tag: vscode.TestTag,
    queue: vscode.TestItem[]
  ): void {
    // Check if this item has the required tag
    const hasTag = item.tags.some(t => t.id === tag.id);
    
    if (hasTag) {
      // This item has the tag - add it and don't recurse into children
      // (running the parent will run all children)
      queue.push(item);
    } else {
      // This item doesn't have the tag, but its children might
      item.children.forEach(child => {
        this.collectTestsWithTag(child, tag, queue);
      });
    }
  }
  
  /**
   * Count the total number of test items recursively.
   */
  private countTests(item: vscode.TestItem): number {
    const data = this.testData.get(item);
    
    // If it's a test, count as 1
    if (data?.type === ItemType.Test) {
      return 1;
    }
    
    // If it's a file or suite, count all children
    let count = 0;
    item.children.forEach(child => {
      count += this.countTests(child);
    });
    return count;
  }

  /**
   * Get the path to the Mocha binary.
   * In PnP environments, uses 'yarn bin mocha' to resolve the virtual path.
   * In traditional environments, returns the standard node_modules path.
   */
  private async getMochaPath(workspacePath: string, isPnP: boolean): Promise<string> {
    if (!isPnP) {
      // Non-PnP environment, use traditional node_modules path
      const mochaPath = path.join(workspacePath, 'node_modules', 'mocha', 'bin', 'mocha.js');
      
      // Verify mocha exists
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(mochaPath));
        return mochaPath;
      } catch {
        throw new Error(
          'Mocha not found in workspace. Please install it: npm install --save-dev mocha'
        );
      }
    }

    // PnP environment, use 'yarn bin mocha' to get the path
    return new Promise((resolve, reject) => {
      const child = spawn('yarn', ['bin', 'mocha'], {
        cwd: workspacePath,
        env: process.env,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          const mochaPath = stdout.trim();
          resolve(mochaPath);
        } else {
          reject(new Error(
            'Mocha not found in workspace. Please install it: yarn add -D mocha'
          ));
        }
      });

      child.on('error', (error) => {
        reject(new Error(
          `Failed to locate Mocha: ${error.message}. Please install it: yarn add -D mocha`
        ));
      });
    });
  }

  async runTests(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken
  ): Promise<void> {
    this.outputChannel.appendLine(`[runTests] Called with continuous=${request.continuous}`);
    
    // Handle continuous run mode
    if (request.continuous) {
      return this.runContinuousTests(request, token);
    }

    // Clear previous test diagnostics at the start of a new run
    this.diagnostics.clearAllDiagnostics();

    this.outputChannel.appendLine('');
    this.outputChannel.appendLine('='.repeat(60));
    this.outputChannel.appendLine('Starting test run...');
    this.outputChannel.appendLine(`Profile: ${request.profile?.label || 'default'}`);
    this.outputChannel.appendLine(`Profile tag: ${request.profile?.tag?.id || 'none'}`);
    this.outputChannel.appendLine('='.repeat(60));

    const run = this.controller.createTestRun(request);
    const queue: vscode.TestItem[] = [];

    // Collect tests to run
    if (request.include) {
      request.include.forEach((test) => {
        queue.push(test);
        this.outputChannel.appendLine(
          `  Test: ${test.label}, Tags: ${test.tags.map(t => t.id).join(', ') || 'none'}`
        );
      });
      this.outputChannel.appendLine(
        `Running ${request.include.length} specific test(s)`
      );
    } else {
      // No specific tests requested - collect all tests and filter by profile tag if needed
      const profileTag = request.profile?.tag;
      
      this.controller.items.forEach((fileItem) => {
        if (profileTag) {
          // Filter tests by tag - only include tests that have the profile's tag
          this.collectTestsWithTag(fileItem, profileTag, queue);
        } else {
          // No tag filter - add all tests
          queue.push(fileItem);
        }
      });
      
      if (profileTag) {
        // Count actual tests within collected items
        const testCount = queue.reduce((sum, item) => sum + this.countTests(item), 0);
        this.outputChannel.appendLine(
          `Running tests with tag "${profileTag.id}" (${queue.length} suite(s), ${testCount} test(s))`
        );
      } else {
        const testCount = queue.reduce((sum, item) => sum + this.countTests(item), 0);
        this.outputChannel.appendLine(`Running all tests (${queue.length} suite(s), ${testCount} test(s))`);
      }
    }

    try {
      // Run each test
      for (const test of queue) {
        if (token.isCancellationRequested) {
          this.outputChannel.appendLine('Test run cancelled');
          run.skipped(test);
          continue;
        }

        if (request.exclude?.includes(test)) {
          continue;
        }

        await this.runTest(test, run, token);
      }

      this.outputChannel.appendLine('✓ Test run completed');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`❌ Test run failed: ${errorMessage}`);
      if (error instanceof Error && error.stack) {
        this.outputChannel.appendLine(error.stack);
      }
    } finally {
      run.end();
      this.outputChannel.appendLine('='.repeat(60));
    }
  }

  /**
   * Find test files that correspond to a source file.
   * Supports common naming patterns like:
   * - src/foo.ts -> src/foo.test.ts, src/foo.spec.ts
   * - src/foo.ts -> test/foo.test.ts, __tests__/foo.test.ts
   * - lib/bar.js -> lib/bar.spec.js, test/bar.spec.js
   * Respects configured extensions for test file discovery.
   */
  private async findTestFilesForSource(sourceUri: vscode.Uri): Promise<vscode.Uri[]> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceUri);
    if (!workspaceFolder) {
      return [];
    }

    const relativePath = vscode.workspace.asRelativePath(sourceUri);
    const parsedPath = path.parse(relativePath);
    const dir = parsedPath.dir;
    const nameWithoutExt = parsedPath.name;

    // Get configured extensions
    const extensions = this.config.extensions || ['js', 'ts'];

    // Generate possible test file patterns for all configured extensions
    const patterns: string[] = [];
    
    for (const ext of extensions) {
      const testExt = `.${ext}`;
      
      // Same directory patterns
      patterns.push(path.join(dir, `${nameWithoutExt}.test${testExt}`));
      patterns.push(path.join(dir, `${nameWithoutExt}.spec${testExt}`));
      
      // Common test directory patterns
      const testDirs = ['test', 'tests', '__tests__', 'spec', 'specs'];
      for (const testDir of testDirs) {
        patterns.push(path.join(testDir, dir, `${nameWithoutExt}.test${testExt}`));
        patterns.push(path.join(testDir, dir, `${nameWithoutExt}.spec${testExt}`));
        patterns.push(path.join(testDir, `${nameWithoutExt}.test${testExt}`));
        patterns.push(path.join(testDir, `${nameWithoutExt}.spec${testExt}`));
      }

      // If source is in src/, also try without src/ prefix
      if (dir.startsWith('src/') || dir.startsWith('src\\')) {
        const dirWithoutSrc = dir.substring(4);
        for (const testDir of testDirs) {
          patterns.push(path.join(testDir, dirWithoutSrc, `${nameWithoutExt}.test${testExt}`));
          patterns.push(path.join(testDir, dirWithoutSrc, `${nameWithoutExt}.spec${testExt}`));
        }
      }
    }

    // Find which patterns actually exist
    const foundUris: vscode.Uri[] = [];
    for (const pattern of patterns) {
      const testUri = vscode.Uri.joinPath(workspaceFolder.uri, pattern);
      try {
        await vscode.workspace.fs.stat(testUri);
        foundUris.push(testUri);
      } catch {
        // File doesn't exist, continue
      }
    }

    return foundUris;
  }

  private async runContinuousTests(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken
  ): Promise<void> {
    this.outputChannel.appendLine('');
    this.outputChannel.appendLine('='.repeat(60));
    this.outputChannel.appendLine('⏯️  CONTINUOUS RUN MODE ACTIVATED');
    this.outputChannel.appendLine(`Profile: ${request.profile?.label || 'default'}`);
    this.outputChannel.appendLine('Tests will auto-run when source or test files are saved');
    this.outputChannel.appendLine('='.repeat(60));

    // Track queued test files for batched execution
    const queuedTestFiles = new Set<string>();
    let debounceTimer: NodeJS.Timeout | undefined;

    // File change handler with debouncing
    const handleFileChange = async (uri: vscode.Uri) => {
      // Check if it's a test file using configured extensions
      const extensions = this.config.extensions || ['js', 'ts'];
      let isTestFile = false;
      for (const ext of extensions) {
        if (uri.path.endsWith(`.test.${ext}`) || uri.path.endsWith(`.spec.${ext}`)) {
          isTestFile = true;
          break;
        }
      }

      let testFilesToRun: vscode.Uri[] = [];

      if (isTestFile) {
        // Direct test file change
        testFilesToRun.push(uri);
        this.outputChannel.appendLine(`📝 Test file changed: ${uri.fsPath}`);
      } else {
        // Source file change - find corresponding test files
        const pathExt = path.extname(uri.path).substring(1); // Remove leading dot
        const isSourceFile = extensions.includes(pathExt);
        
        if (!isSourceFile) {
          return; // Ignore non-source files (config, markdown, etc.)
        }

        this.outputChannel.appendLine(`📝 Source file changed: ${uri.fsPath}`);
        testFilesToRun = await this.findTestFilesForSource(uri);
        
        if (testFilesToRun.length === 0) {
          this.outputChannel.appendLine(`   ⚠️  No corresponding test file found`);
          return;
        }
        
        this.outputChannel.appendLine(`   → Found ${testFilesToRun.length} test file(s)`);
      }

      // Add test files to queue
      for (const testUri of testFilesToRun) {
        queuedTestFiles.add(testUri.toString());
      }

      // Clear existing timer
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      // Debounce: wait 1 second after last change before running
      debounceTimer = setTimeout(async () => {
        if (queuedTestFiles.size === 0) {
          return;
        }

        this.outputChannel.appendLine('');
        this.outputChannel.appendLine(`🔄 Running tests for ${queuedTestFiles.size} changed file(s)...`);

        // Get test items for changed files
        const testsToRun = request.include?.filter(t => 
          t.uri && queuedTestFiles.has(t.uri.toString())
        ) || [];

        if (testsToRun.length === 0) {
          // Find test items from controller
          for (const uriString of queuedTestFiles) {
            const testItem = this.controller.items.get(uriString);
            if (testItem) {
              testsToRun.push(testItem);
            }
          }
        }

        queuedTestFiles.clear();

        if (testsToRun.length > 0) {
          // Create a new request for just these tests
          const newRequest = new vscode.TestRunRequest(
            testsToRun,
            request.exclude,
            request.profile,
            true, // Keep continuous flag
            request.preserveFocus
          );

          // Run the tests (this will call runContinuousTests again, but we'll handle it)
          await this.runSingleTestExecution(newRequest, token);
        }
      }, 1000); // 1 second debounce
    };

    // Watch for file changes (async handler)
    const fileWatcher = vscode.workspace.onDidSaveTextDocument((doc) => {
      this.outputChannel.appendLine(`[ContinuousRun] File saved: ${doc.uri.fsPath}`);
      void handleFileChange(doc.uri);
    });

    // Handle cancellation
    const cancellationHandler = token.onCancellationRequested(() => {
      this.outputChannel.appendLine('');
      this.outputChannel.appendLine('⏹️  Continuous run mode stopped');
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      fileWatcher.dispose();
    });

    this.outputChannel.appendLine('👀 Watching for file changes... (save a source or test file to trigger)');

    // Run initial tests if requested
    if (request.include && request.include.length > 0) {
      this.outputChannel.appendLine('');
      this.outputChannel.appendLine('▶️  Running initial test execution...');
      await this.runSingleTestExecution(request, token);
    }

    // Keep the continuous run alive until cancelled
    // The actual work happens in the file change handlers
  }

  private async runSingleTestExecution(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken
  ): Promise<void> {
    // Run tests without continuous mode to avoid recursion
    const nonContinuousRequest = new vscode.TestRunRequest(
      request.include,
      request.exclude,
      request.profile,
      false, // NOT continuous
      request.preserveFocus
    );

    const run = this.controller.createTestRun(nonContinuousRequest);
    const queue: vscode.TestItem[] = [];

    // Collect tests to run
    if (nonContinuousRequest.include) {
      nonContinuousRequest.include.forEach((test) => queue.push(test));
      this.outputChannel.appendLine(
        `  Running ${nonContinuousRequest.include.length} test file(s)`
      );
    }

    try {
      // Run each test
      for (const test of queue) {
        if (token.isCancellationRequested) {
          this.outputChannel.appendLine('Test run cancelled');
          run.skipped(test);
          continue;
        }

        if (nonContinuousRequest.exclude?.includes(test)) {
          continue;
        }

        await this.runTest(test, run, token);
      }

      this.outputChannel.appendLine('  ✓ Tests completed');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`  ❌ Test run failed: ${errorMessage}`);
    } finally {
      run.end();
    }
  }

  async debugTests(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken
  ): Promise<void> {
    this.outputChannel.appendLine('');
    this.outputChannel.appendLine('='.repeat(60));
    this.outputChannel.appendLine('Starting debug session...');
    this.outputChannel.appendLine('='.repeat(60));

    const run = this.controller.createTestRun(request);

    // Get workspace folder from the first test item
    let workspaceFolder: vscode.WorkspaceFolder | undefined;
    if (request.include && request.include.length > 0) {
      const firstTest = request.include[0];
      workspaceFolder = firstTest.uri
        ? vscode.workspace.getWorkspaceFolder(firstTest.uri)
        : vscode.workspace.workspaceFolders?.[0];
    } else {
      workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    }

    if (!workspaceFolder) {
      this.outputChannel.appendLine('❌ No workspace folder found for debugging');
      run.end();
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;

    // Check if PnP is being used
    const pnpCjsPath = path.join(workspacePath, '.pnp.cjs');
    let isPnP = false;
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(pnpCjsPath));
      isPnP = true;
      this.outputChannel.appendLine('✓ PnP detected for debugging');
    } catch {
      this.outputChannel.appendLine('No PnP detected for debugging');
    }

    // Get the Mocha path
    const mochaPath = await this.getMochaPath(workspacePath, isPnP);
    this.outputChannel.appendLine(`Debug Mocha path: ${mochaPath}`);

    // For debugging, we'll use VS Code's debug API
    const debugConfig: vscode.DebugConfiguration = {
      type: 'node',
      request: 'launch',
      name: 'Debug Mocha Tests',
      program: mochaPath,
      args: this.getTestArgs(request),
      cwd: workspacePath,
      internalConsoleOptions: 'openOnSessionStart',
      console: 'internalConsole',
    };

    // Add PnP support to the debug configuration if needed
    if (isPnP) {
      debugConfig.runtimeArgs = ['--require', pnpCjsPath];
      this.outputChannel.appendLine('✓ Added PnP loader to debug configuration');
    }

    this.outputChannel.appendLine('Debug configuration:');
    this.outputChannel.appendLine(JSON.stringify(debugConfig, null, 2));

    // Start debugging
    const started = await vscode.debug.startDebugging(
      workspaceFolder,
      debugConfig
    );

    if (started) {
      this.outputChannel.appendLine('✓ Debug session started');
    } else {
      this.outputChannel.appendLine('❌ Failed to start debug session');
    }

    if (started) {
      // Wait for the debug session to end
      await new Promise<void>((resolve) => {
        const disposable = vscode.debug.onDidTerminateDebugSession(() => {
          disposable.dispose();
          resolve();
        });
      });
    }

    run.end();
  }

  async runTestsWithCoverage(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (!this.coverage) {
      this.outputChannel.appendLine('❌ Coverage provider not available');
      return;
    }

    this.outputChannel.appendLine('');
    this.outputChannel.appendLine('='.repeat(60));
    this.outputChannel.appendLine('Starting test run with coverage...');
    this.outputChannel.appendLine('='.repeat(60));

    const run = this.controller.createTestRun(request);
    const queue: vscode.TestItem[] = [];

    // Collect tests to run
    if (request.include) {
      request.include.forEach((test) => queue.push(test));
      this.outputChannel.appendLine(
        `Running ${request.include.length} specific test(s) with coverage`
      );
    } else {
      // No specific tests requested - collect all tests and filter by profile tag if needed
      const profileTag = request.profile?.tag;
      
      this.controller.items.forEach((fileItem) => {
        if (profileTag) {
          // Filter tests by tag - only include tests that have the profile's tag
          this.collectTestsWithTag(fileItem, profileTag, queue);
        } else {
          // No tag filter - add all tests
          queue.push(fileItem);
        }
      });
      
      if (profileTag) {
        // Count actual tests within collected items
        const testCount = queue.reduce((sum, item) => sum + this.countTests(item), 0);
        this.outputChannel.appendLine(
          `Running tests with tag "${profileTag.id}" with coverage (${queue.length} suite(s), ${testCount} test(s))`
        );
      } else {
        const testCount = queue.reduce((sum, item) => sum + this.countTests(item), 0);
        this.outputChannel.appendLine(`Running all tests with coverage (${queue.length} suite(s), ${testCount} test(s))`);
      }
    }

    try {
      // Run each test file with coverage
      for (const test of queue) {
        if (token.isCancellationRequested) {
          this.outputChannel.appendLine('Test run cancelled');
          run.skipped(test);
          continue;
        }

        if (request.exclude?.includes(test)) {
          continue;
        }

        await this.runTestWithCoverage(test, run, token);
      }

      this.outputChannel.appendLine('✓ Test run with coverage completed');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`❌ Coverage run failed: ${errorMessage}`);
      if (error instanceof Error && error.stack) {
        this.outputChannel.appendLine(error.stack);
      }
    } finally {
      run.end();
      this.outputChannel.appendLine('='.repeat(60));
    }
  }

  private async runTestWithCoverage(
    test: vscode.TestItem,
    run: vscode.TestRun,
    token: vscode.CancellationToken
  ): Promise<void> {
    const data = this.testData.get(test);
    if (!data) {
      this.outputChannel.appendLine(`⚠ No test data found for: ${test.label}`);
      return;
    }

    switch (data.type) {
      case ItemType.File:
        this.outputChannel.appendLine(`Running file with coverage: ${test.label}`);
        await this.runFileTestsWithCoverage(test, run, token);
        break;
      case ItemType.Suite:
        this.outputChannel.appendLine(`Running suite with coverage: ${test.label}`);
        // Run all children in the suite
        for (const [, child] of test.children) {
          await this.runTestWithCoverage(child, run, token);
        }
        break;
      case ItemType.Test:
        // For individual tests, run the parent file with coverage
        this.outputChannel.appendLine(`Running test with coverage: ${test.label}`);
        let fileItem: vscode.TestItem | undefined = test;
        while (fileItem && this.testData.get(fileItem)?.type !== ItemType.File) {
          fileItem = fileItem.parent;
        }
        if (fileItem) {
          await this.runFileTestsWithCoverage(fileItem, run, token);
        }
        break;
    }
  }

  private async runFileTestsWithCoverage(
    fileItem: vscode.TestItem,
    run: vscode.TestRun,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (!fileItem.uri || !this.coverage) {
      const errorMsg = 'Test file URI or coverage provider is missing';
      this.outputChannel.appendLine(`❌ ${errorMsg}`);
      run.errored(fileItem, new vscode.TestMessage(errorMsg));
      return;
    }

    const testFilePath = fileItem.uri.fsPath;
    this.outputChannel.appendLine(`  File path: ${testFilePath}`);

    // Get the workspace folder
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileItem.uri);
    if (!workspaceFolder) {
      const errorMsg = 'Could not determine workspace folder';
      this.outputChannel.appendLine(`❌ ${errorMsg}`);
      run.errored(fileItem, new vscode.TestMessage(errorMsg));
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    this.outputChannel.appendLine(`  Workspace: ${workspacePath}`);

    // Check for PnP
    const pnpCjsPath = path.join(workspacePath, '.pnp.cjs');
    const nodeArgs: string[] = [];

    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(pnpCjsPath));
      nodeArgs.push('--require', pnpCjsPath);
      this.outputChannel.appendLine(`  ✓ Found .pnp.cjs, will use PnP`);
    } catch {
      this.outputChannel.appendLine(`  No PnP detected`);
    }

    // Get Mocha path
    const isPnP = nodeArgs.some(arg => arg.includes('.pnp.cjs'));
    const mochaPath = await this.getMochaPath(workspacePath, isPnP);
    this.outputChannel.appendLine(`  ✓ Mocha path: ${mochaPath}`);

    // Track test results
    const testResults = new Map<
      string,
      { 
        passed: boolean; 
        message?: string; 
        duration?: number;
        stack?: string;
        expected?: any;
        actual?: any;
      }
    >();

    try {
      // Run with coverage - this returns the stdout containing Mocha JSON results
      const stdout = await this.coverage.runTestsWithCoverage(
        mochaPath,
        testFilePath,
        workspacePath,
        run,
        nodeArgs,
        isPnP,
        token
      );

      // Parse Mocha test results from stdout
      try {
        const results = JSON.parse(stdout);
        this.outputChannel.appendLine(
          `  Parsed ${results.tests?.length || 0} test result(s)`
        );

        if (results.tests) {
          for (const test of results.tests) {
            // A test passes if err is null/undefined or an empty object
            const passed = !test.err || (typeof test.err === 'object' && Object.keys(test.err).length === 0);
            this.outputChannel.appendLine(
              `    Test: "${test.fullTitle}" - Passed: ${passed}, Err: ${test.err ? JSON.stringify(test.err) : 'null'}`
            );
            testResults.set(test.fullTitle, {
              passed: passed,
              message: test.err?.message,
              duration: test.duration,
              stack: test.err?.stack,
              expected: test.err?.expected,
              actual: test.err?.actual,
            });
          }
        }
      } catch (parseError) {
        this.outputChannel.appendLine(
          `  ⚠ Failed to parse test results JSON`
        );
      }

      // Update test results
      this.outputChannel.appendLine(
        `  Updating test results (${testResults.size} test(s))...`
      );
      this.updateTestResults(fileItem, run, testResults);
      this.outputChannel.appendLine('  ✓ Test results updated');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`  ❌ Error running coverage: ${errorMessage}`);
      if (error instanceof Error && error.stack) {
        this.outputChannel.appendLine(error.stack);
      }
      run.errored(
        fileItem,
        new vscode.TestMessage(`Error running coverage: ${errorMessage}`)
      );
    }
  }

  private getTestArgs(request: vscode.TestRunRequest): string[] {
    const args: string[] = [];

    // Add test files
    if (request.include) {
      for (const test of request.include) {
        const data = this.testData.get(test);
        if (data?.type === ItemType.File && test.uri) {
          args.push(test.uri.fsPath);
        }
      }
    }

    return args;
  }

  private async runTest(
    test: vscode.TestItem,
    run: vscode.TestRun,
    token: vscode.CancellationToken
  ): Promise<void> {
    const data = this.testData.get(test);
    if (!data) {
      this.outputChannel.appendLine(`⚠ No test data found for: ${test.label}`);
      return;
    }

    switch (data.type) {
      case ItemType.File:
        this.outputChannel.appendLine(`Running file: ${test.label}`);
        await this.runFileTests(test, run, token);
        break;
      case ItemType.Suite:
        this.outputChannel.appendLine(`Running suite: ${test.label}`);
        // Run all children in the suite
        for (const [, child] of test.children) {
          await this.runTest(child, run, token);
        }
        break;
      case ItemType.Test:
        await this.runSingleTest(test, run, token);
        break;
    }
  }

  private async runFileTests(
    fileItem: vscode.TestItem,
    run: vscode.TestRun,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (!fileItem.uri) {
      const errorMsg = 'Test file URI is missing';
      this.outputChannel.appendLine(`❌ ${errorMsg}`);
      run.errored(fileItem, new vscode.TestMessage(errorMsg));
      return;
    }

    const testFilePath = fileItem.uri.fsPath;
    this.outputChannel.appendLine(`  File path: ${testFilePath}`);

    // Get the workspace folder
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileItem.uri);
    if (!workspaceFolder) {
      const errorMsg = 'Could not determine workspace folder';
      this.outputChannel.appendLine(`❌ ${errorMsg}`);
      run.errored(fileItem, new vscode.TestMessage(errorMsg));
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    this.outputChannel.appendLine(`  Workspace: ${workspacePath}`);

    // Find the Mocha binary - check for Yarn PnP first
    const pnpCjsPath = path.join(workspacePath, '.pnp.cjs');
    const pnpLoaderPath = path.join(workspacePath, '.pnp.loader.mjs');
    
    this.outputChannel.appendLine(`  Looking for PnP files...`);
    this.outputChannel.appendLine(`    .pnp.cjs: ${pnpCjsPath}`);
    
    // Prepare the command to run Mocha with PnP support
    const nodeArgs: string[] = [];
    
    // Add PnP dependency file if it exists
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(pnpCjsPath));
      nodeArgs.push('--require', pnpCjsPath);
      this.outputChannel.appendLine(`  ✓ Found .pnp.cjs, will use dependencies from PnP`);
    } catch {
      this.outputChannel.appendLine(`  ⚠ .pnp.cjs not found, running without PnP`);
    }
    
    // Add PnP loader if it exists
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(pnpLoaderPath));
      nodeArgs.push('--experimental-loader', pnpLoaderPath);
      this.outputChannel.appendLine(`  ✓ Found .pnp.loader.mjs, will use PnP loader`);
    } catch {
      this.outputChannel.appendLine(`  ⚠ .pnp.loader.mjs not found, running default loader PnP`);
    }

    // Determine the Mocha binary path
    const isPnP = nodeArgs.some(arg => arg.includes('.pnp.cjs'));
    
    this.outputChannel.appendLine(
      isPnP
        ? '  Detecting Mocha path for PnP environment...'
        : '  Using traditional Mocha path...'
    );
    
    const mochaPath = await this.getMochaPath(workspacePath, isPnP);
    this.outputChannel.appendLine(`  ✓ Mocha path: ${mochaPath}`);
    
    // Build the command - run twice: once with spec for output, once with json for parsing
    const baseArgs = [
      ...nodeArgs,
      mochaPath,
      testFilePath,
      '--ui', 'bdd',
      '--timeout', this.config.timeout.toString(),
      '--slow', this.config.slow.toString(),
    ];
    
    // Add grep pattern if configured
    if (this.config.grep) {
      baseArgs.push('--grep', this.config.grep);
    }
    
    // Add bail if configured
    if (this.config.bail) {
      baseArgs.push('--bail');
    }
    
    // Add retries if configured
    if (this.config.retries !== undefined && this.config.retries > 0) {
      baseArgs.push('--retries', this.config.retries.toString());
    }
    
    // Add require modules if configured
    if (this.config.require && this.config.require.length > 0) {
      this.config.require.forEach(module => {
        baseArgs.push('--require', module);
      });
    }

    const jsonArgs = [
      ...baseArgs,
      '--reporter', 'json', // Use JSON reporter for parsing results
    ];

    const specArgs = [
      ...baseArgs,
      '--reporter', 'spec', // Use spec reporter for clean terminal output
    ];

    this.outputChannel.appendLine(`  Running command: node ${jsonArgs.join(' ')}`);

    // Track test results
    const testResults = new Map<
      string,
      { 
        passed: boolean;
        pending?: boolean; // Test is skipped/pending
        message?: string; 
        duration?: number;
        stack?: string;
        expected?: any;
        actual?: any;
      }
    >();

    try {
      // Add test run header
      const testCount = this.countTests(fileItem);
      const header = `\r\n${this.colors.bright}${this.colors.cyan}Running ${testCount} test${testCount !== 1 ? 's' : ''}...${this.colors.reset}\r\n`;
      run.appendOutput(header);
      
      // First, run with spec reporter for clean output display
      await new Promise<void>((resolve, reject) => {
        const child = spawn('node', specArgs, {
          cwd: workspacePath,
          env: {
            ...process.env,
            // Don't set NODE_OPTIONS since we're passing nodeArgs directly in the command
          },
        });

        child.stdout?.on('data', (data) => {
          const output = data.toString();
          this.outputChannel.appendLine(`  [stdout] ${output.trim()}`);
          // Append clean spec output to the run for display in Test Results
          run.appendOutput(output.replace(/\n/g, '\r\n'));
        });

        child.stderr?.on('data', (data) => {
          const output = data.toString();
          this.outputChannel.appendLine(`  [stderr] ${output.trim()}`);
          // Append error output to the run
          run.appendOutput(output.replace(/\n/g, '\r\n'));
        });

        child.on('error', (error) => {
          this.outputChannel.appendLine(
            `  ❌ Failed to spawn Mocha (spec): ${error.message}`
          );
          reject(error);
        });

        child.on('close', () => {
          resolve();
        });
      });

      // Then, run with JSON reporter for parsing test results
      await new Promise<void>((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        const child = spawn('node', jsonArgs, {
          cwd: workspacePath,
          env: {
            ...process.env,
            // Don't set NODE_OPTIONS since we're passing nodeArgs directly in the command
          },
        });

        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('error', (error) => {
          this.outputChannel.appendLine(
            `  ❌ Failed to spawn Mocha (json): ${error.message}`
          );
          reject(error);
        });

        child.on('close', (code) => {
          this.outputChannel.appendLine(
            `  Mocha JSON reporter exited with code ${code}`
          );

          // Parse JSON output
          try {
            this.outputChannel.appendLine(`  Raw stdout length: ${stdout.length} characters`);
            
            // Skip logging if stdout is very long (just log first and last parts)
            if (stdout.length > 1000) {
              this.outputChannel.appendLine(`  First 200 chars: ${stdout.substring(0, 200)}`);
              this.outputChannel.appendLine(`  Last 200 chars: ...${stdout.substring(stdout.length - 200)}`);
            } else {
              this.outputChannel.appendLine(`  Full stdout: ${stdout}`);
            }
            
            // Check for stderr
            if (stderr) {
              this.outputChannel.appendLine(`  stderr present: ${stderr.length} characters`);
            }
            
            // Try to extract JSON from stdout (it might be mixed with other output)
            let jsonStr = stdout;
            
            // If there's non-JSON content before the JSON, try to find the JSON part
            const jsonStartMatch = stdout.match(/^\s*\{/m);
            if (jsonStartMatch && jsonStartMatch.index) {
              jsonStr = stdout.substring(jsonStartMatch.index);
              this.outputChannel.appendLine(`  Extracted JSON starting at position ${jsonStartMatch.index}`);
            }
            
            const results = JSON.parse(jsonStr);
            
            // Log the full JSON structure for debugging
            this.outputChannel.appendLine('  JSON structure:');
            this.outputChannel.appendLine(`    tests: ${results.tests?.length || 0}`);
            this.outputChannel.appendLine(`    pending: ${results.pending?.length || 0}`);
            this.outputChannel.appendLine(`    failures: ${results.failures?.length || 0}`);
            this.outputChannel.appendLine(`    passes: ${results.passes?.length || 0}`);
            
            this.outputChannel.appendLine(
              `  Parsed ${results.tests?.length || 0} test result(s)`
            );

            // Process test results
            if (results.tests) {
              for (const test of results.tests) {
                // Log test properties to see what's available
                const testProps = Object.keys(test).join(', ');
                this.outputChannel.appendLine(`    Test properties: ${testProps}`);
                
                // Check if test is pending/skipped (check both 'pending' and 'skipped' properties)
                const isPending = test.pending === true || test.skipped === true;
                
                // A test passes if err is null/undefined or an empty object (and not pending)
                const passed = !isPending && (!test.err || (typeof test.err === 'object' && Object.keys(test.err).length === 0));
                
                this.outputChannel.appendLine(
                  `    Test: "${test.fullTitle}" - Passed: ${passed}, Pending: ${test.pending || false}, Skipped: ${test.skipped || false}, Err: ${test.err ? JSON.stringify(test.err) : 'null'}`
                );
                testResults.set(test.fullTitle, {
                  passed: passed,
                  pending: isPending,
                  message: test.err?.message,
                  duration: test.duration,
                  stack: test.err?.stack,
                  expected: test.err?.expected,
                  actual: test.err?.actual,
                });
              }
            }
            
            // Also process pending tests (tests that were never executed)
            if (results.pending) {
              for (const test of results.pending) {
                this.outputChannel.appendLine(
                  `    Pending Test: "${test.fullTitle}"`
                );
                testResults.set(test.fullTitle, {
                  passed: false,
                  pending: true,
                  duration: 0,
                });
              }
            }

            resolve();
          } catch (parseError) {
            this.outputChannel.appendLine(
              `  ⚠ Failed to parse JSON output: ${parseError instanceof Error ? parseError.message : String(parseError)}`
            );
            this.outputChannel.appendLine(`  stdout: ${stdout.substring(0, 1000)}`);
            this.outputChannel.appendLine(`  stderr: ${stderr}`);
            // If JSON parsing fails, just check exit code
            if (code === 0) {
              // Mark all tests as passed (couldn't parse details)
              fileItem.children.forEach((child) => {
                this.markAllChildrenPassed(child, run);
              });
            }
            resolve();
          }
        });
      });

      // Update test results
      this.outputChannel.appendLine(
        `  Updating test results (${testResults.size} test(s))...`
      );
      this.updateTestResults(fileItem, run, testResults);
      this.outputChannel.appendLine('  ✓ Test results updated');
      
      // Add formatted summary to test output
      const stats = this.calculateStats(testResults);
      const summary = this.formatTestSummary(stats);
      run.appendOutput(summary);
      
      this.outputChannel.appendLine(
        `  Summary: ${stats.passed} passed, ${stats.failed} failed (${this.formatDuration(stats.duration)})`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`  ❌ Error running tests: ${errorMessage}`);
      if (error instanceof Error && error.stack) {
        this.outputChannel.appendLine(error.stack);
      }
      run.errored(
        fileItem,
        new vscode.TestMessage(`Error running tests: ${errorMessage}`)
      );
    }
  }

  private markAllChildrenPassed(
    item: vscode.TestItem,
    run: vscode.TestRun
  ): void {
    const data = this.testData.get(item);
    if (data?.type === ItemType.Test) {
      run.passed(item);
    }
    item.children.forEach((child) => {
      this.markAllChildrenPassed(child, run);
    });
  }

  private async runSingleTest(
    testItem: vscode.TestItem,
    run: vscode.TestRun,
    token: vscode.CancellationToken
  ): Promise<void> {
    // Find the parent file
    let fileItem: vscode.TestItem | undefined = testItem;
    while (fileItem && this.testData.get(fileItem)?.type !== ItemType.File) {
      fileItem = fileItem.parent;
    }

    if (!fileItem || !fileItem.uri) {
      run.errored(testItem, new vscode.TestMessage('Could not find test file'));
      return;
    }

    const testFilePath = fileItem.uri.fsPath;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileItem.uri);
    
    if (!workspaceFolder) {
      run.errored(testItem, new vscode.TestMessage('Could not determine workspace folder'));
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    
    // Prepare node args with PnP support
    const nodeArgs: string[] = [];
    const pnpCjsPath = path.join(workspacePath, '.pnp.cjs');
    
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(pnpCjsPath));
      nodeArgs.push('--require', pnpCjsPath);
    } catch {
      // PnP not found, continue without it
    }

    // Determine the Mocha binary path (same logic as runFileTests)
    const isPnP = nodeArgs.some((arg) => arg.includes('.pnp.cjs'));
    const mochaPath = await this.getMochaPath(workspacePath, isPnP);

    // For single test execution, use grep to filter
    const args = [
      ...nodeArgs,
      mochaPath,
      testFilePath,
      '--reporter', 'json',
      '--ui', 'bdd',
      '--timeout', this.config.timeout.toString(),
      '--slow', this.config.slow.toString(),
      '--grep', testItem.label,
    ];
    
    // Add bail if configured
    if (this.config.bail) {
      args.push('--bail');
    }
    
    // Add retries if configured
    if (this.config.retries !== undefined && this.config.retries > 0) {
      args.push('--retries', this.config.retries.toString());
    }
    
    // Add require modules if configured
    if (this.config.require && this.config.require.length > 0) {
      this.config.require.forEach(module => {
        args.push('--require', module);
      });
    }

    const startTime = Date.now();

    try {
      run.started(testItem);

      await new Promise<void>((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        const child = spawn('node', args, {
          cwd: workspacePath,
          env: {
            ...process.env,
            NODE_OPTIONS: nodeArgs.length > 0 ? nodeArgs.join(' ') : undefined,
          },
        });

        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', (code) => {
          const duration = Date.now() - startTime;

          try {
            const results = JSON.parse(stdout);
            if (results.tests && results.tests.length > 0) {
              const test = results.tests[0];
              // A test passes if err is null/undefined or an empty object
              const passed = !test.err || (typeof test.err === 'object' && Object.keys(test.err).length === 0);
              if (passed) {
                run.passed(testItem, duration);
              } else {
                run.failed(
                  testItem,
                  new vscode.TestMessage(test.err?.message || 'Test failed'),
                  duration
                );
              }
            } else if (code === 0) {
              run.passed(testItem, duration);
            } else {
              run.failed(
                testItem,
                new vscode.TestMessage(stderr || 'Test failed'),
                duration
              );
            }
          } catch {
            // JSON parse failed, use exit code
            if (code === 0) {
              run.passed(testItem, duration);
            } else {
              run.failed(
                testItem,
                new vscode.TestMessage(stderr || 'Test failed'),
                duration
              );
            }
          }

          resolve();
        });

        child.on('error', (error) => {
          reject(error);
        });

        if (token.isCancellationRequested) {
          child.kill();
          run.skipped(testItem);
          reject(new Error('Test cancelled'));
        }

        token.onCancellationRequested(() => {
          child.kill();
          run.skipped(testItem);
          reject(new Error('Test cancelled'));
        });
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      run.failed(
        testItem,
        new vscode.TestMessage(
          error instanceof Error ? error.message : String(error)
        ),
        duration
      );
    }
  }

  private findTestItemId(
    fileItem: vscode.TestItem,
    fullTitle: string
  ): string | undefined {
    const parts = fullTitle.split(' ');
    const testName = parts[parts.length - 1];
    return this.searchForTestId(fileItem, testName);
  }

  private searchForTestId(
    item: vscode.TestItem,
    testName: string
  ): string | undefined {
    if (item.label === testName) {
      return item.id;
    }

    for (const [, child] of item.children) {
      const found = this.searchForTestId(child, testName);
      if (found) {
        return found;
      }
    }

    return undefined;
  }

  private findTestItem(
    fileItem: vscode.TestItem,
    testId: string
  ): vscode.TestItem | undefined {
    if (fileItem.id === testId) {
      return fileItem;
    }

    for (const [, child] of fileItem.children) {
      const found = this.findTestItem(child, testId);
      if (found) {
        return found;
      }
    }

    return undefined;
  }

  private updateTestResults(
    fileItem: vscode.TestItem,
    run: vscode.TestRun,
    results: Map<string, { 
      passed: boolean;
      pending?: boolean;
      message?: string; 
      duration?: number;
      stack?: string;
      expected?: any;
      actual?: any;
    }>
  ): void {
    this.updateChildResults(fileItem, run, results);
    
    // After processing all results, check if all tests passed
    // If so, clear diagnostics for this file
    const allPassed = Array.from(results.values()).every(r => r.passed || r.pending);
    if (allPassed && fileItem.uri) {
      this.outputChannel.appendLine(`[TestRunner] All tests passed for ${fileItem.uri.fsPath}, clearing diagnostics`);
      this.diagnostics.clearFileDignostics(fileItem.uri);
    }
  }

  private updateChildResults(
    item: vscode.TestItem,
    run: vscode.TestRun,
    results: Map<string, { 
      passed: boolean;
      pending?: boolean;
      message?: string; 
      duration?: number;
      stack?: string;
      expected?: any;
      actual?: any;
    }>
  ): void {
    const data = this.testData.get(item);
    this.outputChannel.appendLine(`[updateChildResults] Processing item: "${item.label}", type: ${data?.type === ItemType.File ? 'File' : data?.type === ItemType.Suite ? 'Suite' : data?.type === ItemType.Test ? 'Test' : 'Unknown'}, children: ${item.children.size}`);

    if (data?.type === ItemType.Test) {
      // Build the full title path for this test item
      const fullTitlePath = this.buildFullTitlePath(item);
      this.outputChannel.appendLine(
        `    Matching test item "${item.label}" with path: "${fullTitlePath}"`
      );
      
      // Find the result for this test by exact match or by checking if the full title ends with our path
      for (const [fullTitle, result] of results.entries()) {
        if (fullTitle === fullTitlePath || fullTitle.endsWith(fullTitlePath)) {
          this.outputChannel.appendLine(
            `      ✓ Matched to Mocha result: "${fullTitle}" - Passed: ${result.passed}, Pending: ${result.pending || false}`
          );
          
          if (result.pending) {
            // Mark test as skipped
            run.skipped(item);
          } else if (result.passed) {
            run.passed(item, result.duration);
            // Note: We don't clear diagnostics here per-test since other tests might have failed
            // Diagnostics are cleared at the start of each test run instead
          } else {
            // Create enhanced test message with location and diff
            const testMessage = this.createTestMessage(result, item);
            run.failed(item, testMessage, result.duration);
            
            // Add diagnostic entry to Problems panel
            if (item.uri) {
              const line = this.testData.get(item)?.line ?? 0;
              this.outputChannel.appendLine(`[TestRunner] Creating diagnostic for test: ${item.label}`);
              this.outputChannel.appendLine(`[TestRunner]   URI: ${item.uri.toString()}`);
              this.outputChannel.appendLine(`[TestRunner]   Line: ${line}`);
              this.diagnostics.addTestFailure(
                item.uri,
                item.label,
                result.message || 'Test failed',
                line,
                result.stack
              );
            } else {
              this.outputChannel.appendLine(`[TestRunner] WARNING: No URI for test item: ${item.label}`);
            }
          }
          return; // Found and processed this test, no need to check children
        }
      }
      
      this.outputChannel.appendLine(
        `      ⚠ No matching result found for: "${fullTitlePath}"`
      );
      return; // This is a test item with no match, don't recurse (tests have no children)
    }

    // For Files and Suites: recursively update children
    for (const [, child] of item.children) {
      this.updateChildResults(child, run, results);
    }
  }

  /**
   * Create an enhanced TestMessage with location and diff information
   */
  private createTestMessage(
    result: {
      message?: string;
      stack?: string;
      expected?: any;
      actual?: any;
    },
    item: vscode.TestItem
  ): vscode.TestMessage {
    const message = new vscode.TestMessage(result.message || 'Test failed');

    // Add stack trace if available
    if (result.stack) {
      message.stackTrace = this.parseStackTrace(result.stack, item.uri);
    }

    // Add expected/actual for assertion failures
    if (result.expected !== undefined && result.actual !== undefined) {
      message.expectedOutput = this.formatValue(result.expected);
      message.actualOutput = this.formatValue(result.actual);
    }

    return message;
  }

  /**
   * Parse stack trace string into TestMessageStackFrame array
   */
  private parseStackTrace(
    stack: string,
    testFileUri?: vscode.Uri
  ): vscode.TestMessageStackFrame[] {
    const frames: vscode.TestMessageStackFrame[] = [];
    const lines = stack.split('\n');

    for (const line of lines) {
      // Match stack frame format: "at functionName (file:line:column)" or "at file:line:column"
      const match = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/);
      if (match) {
        const [, label, file, lineStr, columnStr] = match;
        const lineNum = parseInt(lineStr, 10) - 1; // VS Code uses 0-based line numbers
        const column = parseInt(columnStr, 10) - 1;

        // Create URI for the file
        let uri: vscode.Uri;
        if (file.startsWith('file://')) {
          uri = vscode.Uri.parse(file);
        } else if (path.isAbsolute(file)) {
          uri = vscode.Uri.file(file);
        } else if (testFileUri) {
          // Relative path, resolve against test file directory
          const dir = path.dirname(testFileUri.fsPath);
          uri = vscode.Uri.file(path.join(dir, file));
        } else {
          continue; // Skip if we can't resolve the path
        }

        const position = new vscode.Position(lineNum, column);
        const location = new vscode.Location(uri, position);

        frames.push({
          uri,
          position,
          label: label || path.basename(file),
        });
      }
    }

    return frames;
  }

  /**
   * Format expected/actual values for display
   */
  private formatValue(value: any): string {
    if (value === undefined) {
      return 'undefined';
    }
    if (value === null) {
      return 'null';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  /**
   * Build the full title path for a test item (e.g., "Suite Name test name")
   */
  private buildFullTitlePath(item: vscode.TestItem): string {
    const parts: string[] = [];
    let current: vscode.TestItem | undefined = item;

    while (current) {
      const data = this.testData.get(current);
      // Skip the file item
      if (data?.type !== ItemType.File) {
        parts.unshift(current.label);
      }
      current = current.parent;
    }

    return parts.join(' ');
  }

  /**
   * ANSI color codes for terminal output
   */
  private readonly colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    
    // Colors
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    
    // Background colors
    bgGreen: '\x1b[42m',
    bgRed: '\x1b[41m',
    bgYellow: '\x1b[43m',
  };

  /**
   * Format duration in human-readable format
   */
  private formatDuration(ms: number | undefined): string {
    if (ms === undefined) return '';
    
    if (ms < 1) return '<1ms';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 10000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  /**
   * Create a formatted summary line with statistics
   */
  private formatTestSummary(stats: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  }): string {
    const { total, passed, failed, skipped, duration } = stats;
    
    const parts: string[] = [];
    
    // Passed tests (green)
    if (passed > 0) {
      parts.push(`${this.colors.green}${passed} passing${this.colors.reset}`);
    }
    
    // Failed tests (red)
    if (failed > 0) {
      parts.push(`${this.colors.red}${failed} failing${this.colors.reset}`);
    }
    
    // Skipped tests (yellow)
    if (skipped > 0) {
      parts.push(`${this.colors.yellow}${skipped} skipped${this.colors.reset}`);
    }
    
    // Total duration
    const durationStr = this.formatDuration(duration);
    
    return `\r\n${this.colors.bright}Test Results:${this.colors.reset} ${parts.join(', ')} ${this.colors.dim}(${durationStr})${this.colors.reset}\r\n`;
  }

  /**
   * Format a single test result line with colors
   */
  private formatTestResult(test: {
    title: string;
    passed: boolean;
    duration?: number;
    depth: number;
  }): string {
    const indent = '  '.repeat(test.depth);
    const durationStr = test.duration ? ` ${this.colors.dim}(${this.formatDuration(test.duration)})${this.colors.reset}` : '';
    
    if (test.passed) {
      return `${indent}${this.colors.green}✓${this.colors.reset} ${this.colors.dim}${test.title}${this.colors.reset}${durationStr}\r\n`;
    } else {
      return `${indent}${this.colors.red}✗${this.colors.reset} ${test.title}${durationStr}\r\n`;
    }
  }

  /**
   * Calculate test statistics from results
   */
  private calculateStats(results: Map<string, { 
    passed: boolean;
    pending?: boolean;
    duration?: number;
  }>): {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  } {
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let totalDuration = 0;
    
    for (const result of results.values()) {
      if (result.pending) {
        skipped++;
      } else if (result.passed) {
        passed++;
      } else {
        failed++;
      }
      totalDuration += result.duration || 0;
    }
    
    return {
      total: results.size,
      passed,
      failed,
      skipped,
      duration: totalDuration,
    };
  }
}


