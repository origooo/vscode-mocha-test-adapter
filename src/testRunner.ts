import * as vscode from 'vscode';
import Mocha from 'mocha';

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
    private readonly outputChannel: vscode.OutputChannel
  ) {}

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

    // For debugging, we'll use VS Code's debug API
    const debugConfig: vscode.DebugConfiguration = {
      type: 'node',
      request: 'launch',
      name: 'Debug Mocha Tests',
      program: '${workspaceFolder}/node_modules/mocha/bin/_mocha',
      args: this.getTestArgs(request),
      internalConsoleOptions: 'openOnSessionStart',
      console: 'internalConsole',
    };

    this.outputChannel.appendLine('Debug configuration:');
    this.outputChannel.appendLine(JSON.stringify(debugConfig, null, 2));

    // Start debugging
    const started = await vscode.debug.startDebugging(undefined, debugConfig);

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

    this.outputChannel.appendLine(`  File path: ${fileItem.uri.fsPath}`);

    // Create a new Mocha instance
    const mocha = new Mocha({
      ui: 'bdd',
      timeout: 5000,
    });

    this.outputChannel.appendLine('  Creating Mocha instance...');

    // Add the test file
    try {
      mocha.addFile(fileItem.uri.fsPath);
      this.outputChannel.appendLine('  ✓ Test file added to Mocha');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`  ❌ Failed to add file: ${errorMessage}`);
      run.errored(fileItem, new vscode.TestMessage(errorMessage));
      return;
    }

    // Track test results
    const testResults = new Map<
      string,
      { passed: boolean; message?: string; duration?: number }
    >();

    try {
      this.outputChannel.appendLine('  Running tests with Mocha...');

      // Run the tests
      await new Promise<void>((resolve, reject) => {
        const runner = mocha.run((failures) => {
          this.outputChannel.appendLine(
            `  Mocha run completed with ${failures} failure(s)`
          );
          if (failures > 0) {
            resolve();
          } else {
            resolve();
          }
        });

        runner.on('test', (test) => {
          const testId = this.findTestItemId(fileItem, test.fullTitle());
          if (testId) {
            const testItem = this.findTestItem(fileItem, testId);
            if (testItem) {
              run.started(testItem);
            }
          }
        });

        runner.on('pass', (test) => {
          testResults.set(test.fullTitle(), {
            passed: true,
            duration: test.duration,
          });
        });

        runner.on('fail', (test, err) => {
          testResults.set(test.fullTitle(), {
            passed: false,
            message: err.message,
          });
        });

        runner.on('end', () => {
          resolve();
        });

        if (token.isCancellationRequested) {
          runner.abort();
          reject(new Error('Test run cancelled'));
        }
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
      this.outputChannel.appendLine(
        `  ❌ Error running tests: ${errorMessage}`
      );
      if (error instanceof Error && error.stack) {
        this.outputChannel.appendLine(error.stack);
      }
      run.errored(fileItem, new vscode.TestMessage(`Error running tests: ${errorMessage}`));
    }
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
      run.errored(
        testItem,
        new vscode.TestMessage('Could not find test file')
      );
      return;
    }

    // For single test execution, we'll use grep to filter
    const mocha = new Mocha({
      ui: 'bdd',
      timeout: 5000,
      grep: testItem.label,
    });

    mocha.addFile(fileItem.uri.fsPath);

    const startTime = Date.now();

    try {
      run.started(testItem);

      await new Promise<void>((resolve, reject) => {
        const runner = mocha.run((failures) => {
          if (failures > 0) {
            reject(new Error('Test failed'));
          } else {
            resolve();
          }
        });

        runner.on('fail', (test, err) => {
          const duration = Date.now() - startTime;
          run.failed(testItem, new vscode.TestMessage(err.message), duration);
          resolve();
        });

        runner.on('pass', () => {
          const duration = Date.now() - startTime;
          run.passed(testItem, duration);
          resolve();
        });

        if (token.isCancellationRequested) {
          runner.abort();
          run.skipped(testItem);
          reject(new Error('Test cancelled'));
        }
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
      // Find the result for this test
      for (const [fullTitle, result] of results.entries()) {
        if (fullTitle.includes(item.label)) {
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
    }

    // Recursively update children
    for (const [, child] of item.children) {
      this.updateChildResults(child, run, results);
    }
  }
}
