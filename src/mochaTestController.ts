import * as vscode from 'vscode';
import { TestDiscovery } from './testDiscovery.js';
import { TestRunner } from './testRunner.js';

enum ItemType {
  File,
  Suite,
  Test,
}

interface TestData {
  type: ItemType;
  line?: number;
}

export class MochaTestController {
  private readonly controller: vscode.TestController;
  private readonly testData = new WeakMap<vscode.TestItem, TestData>();
  private readonly discovery: TestDiscovery;
  private readonly runner: TestRunner;
  private fileWatchers: vscode.FileSystemWatcher[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly outputChannel: vscode.OutputChannel
  ) {
    this.outputChannel.appendLine('Creating test controller...');

    // Create the test controller for Mocha
    this.controller = vscode.tests.createTestController(
      'mochaTestController',
      'Mocha Tests'
    );
    this.outputChannel.appendLine('✓ Test controller created');

    this.outputChannel.appendLine('Initializing test discovery module...');
    this.discovery = new TestDiscovery(
      this.controller,
      this.testData,
      this.outputChannel
    );
    this.outputChannel.appendLine('✓ Test discovery module initialized');

    this.outputChannel.appendLine('Initializing test runner module...');
    this.runner = new TestRunner(
      this.controller,
      this.testData,
      this.outputChannel
    );
    this.outputChannel.appendLine('✓ Test runner module initialized');

    // Set up the resolve handler for lazy test discovery
    this.controller.resolveHandler = async (item) => {
      if (!item) {
        // Discover all tests in the workspace
        await this.discoverAllTests();
      } else {
        // Resolve children for a specific item (e.g., a file)
        await this.discovery.resolveTestItem(item);
      }
    };

    // Create run profiles
    this.createRunProfiles();

    // Register for disposal
    context.subscriptions.push(this.controller);
  }

  private createRunProfiles() {
    // Create a run profile for running tests
    const runProfile = this.controller.createRunProfile(
      'Run Tests',
      vscode.TestRunProfileKind.Run,
      async (request, token) => {
        await this.runner.runTests(request, token);
      },
      true,
      undefined,
      false
    );

    // Create a debug profile for debugging tests
    const debugProfile = this.controller.createRunProfile(
      'Debug Tests',
      vscode.TestRunProfileKind.Debug,
      async (request, token) => {
        await this.runner.debugTests(request, token);
      },
      true,
      undefined,
      false
    );

    this.context.subscriptions.push(runProfile, debugProfile);
  }

  async initialize() {
    this.outputChannel.appendLine('Setting up file watchers...');
    // Watch for test file changes
    await this.setupFileWatchers();
    this.outputChannel.appendLine('✓ File watchers set up');

    this.outputChannel.appendLine('Registering document event handlers...');
    // Watch for open documents
    this.context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (this.isTestFile(doc)) {
          this.outputChannel.appendLine(
            `Document opened: ${doc.uri.fsPath}, parsing tests...`
          );
          this.discovery.parseTestFile(doc.uri);
        }
      })
    );

    // Watch for document changes
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (this.isTestFile(e.document)) {
          this.outputChannel.appendLine(
            `Document changed: ${e.document.uri.fsPath}, re-parsing tests...`
          );
          this.discovery.parseTestFile(e.document.uri);
        }
      })
    );
    this.outputChannel.appendLine('✓ Document event handlers registered');
  }

  private async setupFileWatchers() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      this.outputChannel.appendLine('  No workspace folders found');
      return;
    }

    this.outputChannel.appendLine(
      `  Found ${workspaceFolders.length} workspace folder(s)`
    );

    for (const folder of workspaceFolders) {
      this.outputChannel.appendLine(`  Setting up watchers for: ${folder.uri.fsPath}`);
      // Watch for .test.ts, .spec.ts, .test.js, .spec.js files
      const patterns = ['**/*.test.{ts,js}', '**/*.spec.{ts,js}'];

      for (const pattern of patterns) {
        const relativePattern = new vscode.RelativePattern(folder, pattern);
        const watcher =
          vscode.workspace.createFileSystemWatcher(relativePattern);

        watcher.onDidCreate((uri) => {
          this.outputChannel.appendLine(`  File created: ${uri.fsPath}`);
          this.discovery.parseTestFile(uri);
        });
        watcher.onDidChange((uri) => {
          this.outputChannel.appendLine(`  File changed: ${uri.fsPath}`);
          this.discovery.parseTestFile(uri);
        });
        watcher.onDidDelete((uri) => {
          this.outputChannel.appendLine(`  File deleted: ${uri.fsPath}`);
          this.controller.items.delete(uri.toString());
        });

        this.fileWatchers.push(watcher);
        this.context.subscriptions.push(watcher);
        this.outputChannel.appendLine(`  ✓ Watcher created for pattern: ${pattern}`);
      }
    }
  }

  private async discoverAllTests() {
    this.outputChannel.appendLine('Discovering all tests in workspace...');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      this.outputChannel.appendLine('  No workspace folders found');
      return;
    }

    let totalFiles = 0;

    for (const folder of workspaceFolders) {
      this.outputChannel.appendLine(`  Scanning folder: ${folder.uri.fsPath}`);
      const patterns = ['**/*.test.{ts,js}', '**/*.spec.{ts,js}'];

      for (const pattern of patterns) {
        this.outputChannel.appendLine(`    Pattern: ${pattern}`);
        const files = await vscode.workspace.findFiles(
          new vscode.RelativePattern(folder, pattern),
          '**/node_modules/**'
        );

        this.outputChannel.appendLine(`    Found ${files.length} file(s)`);
        totalFiles += files.length;

        for (const file of files) {
          await this.discovery.parseTestFile(file);
        }
      }
    }

    this.outputChannel.appendLine(`✓ Test discovery complete: ${totalFiles} test file(s) found`);
  }

  private isTestFile(document: vscode.TextDocument): boolean {
    const uri = document.uri;
    return (
      uri.scheme === 'file' &&
      (uri.path.endsWith('.test.ts') ||
        uri.path.endsWith('.spec.ts') ||
        uri.path.endsWith('.test.js') ||
        uri.path.endsWith('.spec.js'))
    );
  }

  async refresh() {
    this.controller.items.replace([]);
    await this.discoverAllTests();
  }

  dispose() {
    this.controller.dispose();
    this.fileWatchers.forEach((w) => w.dispose());
  }
}
