import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import { CoverageProvider } from './coverageProvider.js';

enum ItemType {
  File,
  Suite,
  Test,
}

interface TestData {
  type: ItemType;
  line?: number;
}

export class TestRunner {
  constructor(
    private readonly controller: vscode.TestController,
    private readonly testData: WeakMap<vscode.TestItem, TestData>,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly coverage?: CoverageProvider
  ) {}

  /**
   * Get the path to the Mocha binary.
   * In PnP environments, uses 'yarn bin mocha' to resolve the virtual path.
   * In traditional environments, returns the standard node_modules path.
   */
  private async getMochaPath(workspacePath: string, isPnP: boolean): Promise<string> {
    if (!isPnP) {
      // Non-PnP environment, use traditional node_modules path
      return path.join(workspacePath, 'node_modules', 'mocha', 'bin', 'mocha.js');
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
          // Fallback to default path if yarn bin fails
          this.outputChannel.appendLine(
            `  ⚠ yarn bin mocha failed with code ${code}, using fallback path`
          );
          resolve(path.join(workspacePath, 'node_modules', 'mocha', 'bin', 'mocha.js'));
        }
      });

      child.on('error', (error) => {
        // Fallback to default path on error
        this.outputChannel.appendLine(
          `  ⚠ Failed to run yarn bin mocha: ${error.message}, using fallback path`
        );
        resolve(path.join(workspacePath, 'node_modules', 'mocha', 'bin', 'mocha.js'));
      });
    });
  }

  async runTests(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken
  ): Promise<void> {
    this.outputChannel.appendLine('');
    this.outputChannel.appendLine('='.repeat(60));
    this.outputChannel.appendLine('Starting test run...');
    this.outputChannel.appendLine('='.repeat(60));

    const run = this.controller.createTestRun(request);
    const queue: vscode.TestItem[] = [];

    // Collect tests to run
    if (request.include) {
      request.include.forEach((test) => queue.push(test));
      this.outputChannel.appendLine(
        `Running ${request.include.length} specific test(s)`
      );
    } else {
      this.controller.items.forEach((test) => queue.push(test));
      this.outputChannel.appendLine('Running all tests');
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
      this.controller.items.forEach((test) => queue.push(test));
      this.outputChannel.appendLine('Running all tests with coverage');
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
      { passed: boolean; message?: string; duration?: number }
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
    
    // Build the command
    const args = [
      ...nodeArgs,
      mochaPath,
      testFilePath,
      '--reporter', 'json', // Use JSON reporter for easy parsing
      '--ui', 'bdd',
      '--timeout', '5000',
    ];

    this.outputChannel.appendLine(`  Running command: node ${args.join(' ')}`);

    // Track test results
    const testResults = new Map<
      string,
      { passed: boolean; message?: string; duration?: number }
    >();

    try {
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
          const output = data.toString();
          stdout += output;
          this.outputChannel.appendLine(`  [stdout] ${output.trim()}`);
        });

        child.stderr?.on('data', (data) => {
          const output = data.toString();
          stderr += output;
          this.outputChannel.appendLine(`  [stderr] ${output.trim()}`);
        });

        child.on('error', (error) => {
          this.outputChannel.appendLine(
            `  ❌ Failed to spawn Mocha: ${error.message}`
          );
          reject(error);
        });

        child.on('close', (code) => {
          this.outputChannel.appendLine(
            `  Mocha process exited with code ${code}`
          );

          // Parse JSON output
          try {
            const results = JSON.parse(stdout);
            this.outputChannel.appendLine(
              `  Parsed ${results.tests?.length || 0} test result(s)`
            );

            // Process test results
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
                });
              }
            }

            resolve();
          } catch (parseError) {
            this.outputChannel.appendLine(
              `  ⚠ Failed to parse JSON output, using exit code`
            );
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

        // Handle cancellation
        if (token.isCancellationRequested) {
          child.kill();
          reject(new Error('Test run cancelled'));
        }

        token.onCancellationRequested(() => {
          child.kill();
          reject(new Error('Test run cancelled'));
        });
      });

      // Update test results
      this.outputChannel.appendLine(
        `  Updating test results (${testResults.size} test(s))...`
      );
      this.updateTestResults(fileItem, run, testResults);
      this.outputChannel.appendLine('  ✓ Test results updated');
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
      '--timeout', '5000',
      '--grep', testItem.label,
    ];

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
    results: Map<string, { passed: boolean; message?: string; duration?: number }>
  ): void {
    this.updateChildResults(fileItem, run, results);
  }

  private updateChildResults(
    item: vscode.TestItem,
    run: vscode.TestRun,
    results: Map<string, { passed: boolean; message?: string; duration?: number }>
  ): void {
    const data = this.testData.get(item);

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
            `      ✓ Matched to Mocha result: "${fullTitle}" - Passed: ${result.passed}`
          );
          if (result.passed) {
            run.passed(item, result.duration);
          } else {
            run.failed(
              item,
              new vscode.TestMessage(result.message || 'Test failed'),
              result.duration
            );
          }
          return;
        }
      }
      
      this.outputChannel.appendLine(
        `      ⚠ No matching result found for: "${fullTitlePath}"`
      );
    }

    // Recursively update children
    for (const [, child] of item.children) {
      this.updateChildResults(child, run, results);
    }
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
}
