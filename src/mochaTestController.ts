import * as vscode from 'vscode';
import { TestDiscovery } from './testDiscovery.js';
import { TestRunner } from './testRunner.js';
import { CoverageProvider } from './coverageProvider.js';
import { ConfigLoader } from './configLoader.js';

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
  retries?: number; // Number of times to retry failed tests
  require?: string[]; // Modules to require before running tests
  ignore?: string[]; // Patterns to ignore during test discovery
  extensions?: string[]; // Test file extensions (e.g., ['ts', 'js', 'mjs'])
}

export class MochaTestController {
  private readonly controller: vscode.TestController;
  private readonly testData = new WeakMap<vscode.TestItem, TestData>();
  private readonly discovery: TestDiscovery;
  private readonly runner: TestRunner;
  private readonly coverage: CoverageProvider;
  private readonly configLoader: ConfigLoader;
  private fileWatchers: vscode.FileSystemWatcher[] = [];
  private config: MochaConfig = {
    timeout: 5000,
    slow: 75,
    bail: false,
    extensions: ['js', 'ts'], // Default Mocha extensions
  };

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

    this.outputChannel.appendLine('Initializing config loader...');
    this.configLoader = new ConfigLoader(outputChannel);
    this.outputChannel.appendLine('✓ Config loader initialized');

    this.outputChannel.appendLine('Initializing coverage provider...');
    this.coverage = new CoverageProvider(this.outputChannel);
    this.outputChannel.appendLine('✓ Coverage provider initialized');

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
      this.outputChannel,
      this.coverage
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
    // Create a run profile for running ALL tests (no tag filter)
    const runProfile = this.controller.createRunProfile(
      'Run Tests',
      vscode.TestRunProfileKind.Run,
      async (request, token) => {
        await this.runner.runTests(request, token);
      },
      true,
      undefined,
      true // Enable continuous run support
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

    // Create a coverage profile for running tests with coverage
    const coverageProfile = this.controller.createRunProfile(
      'Run with Coverage',
      vscode.TestRunProfileKind.Coverage,
      async (request, token) => {
        await this.runner.runTestsWithCoverage(request, token);
      },
      true,
      undefined,
      false
    );

    // Set up detailed coverage loader
    coverageProfile.loadDetailedCoverage = async (testRun, fileCoverage, token) => {
      return this.coverage.loadDetailedCoverage(testRun, fileCoverage, token);
    };

    // Create tag-specific run profiles
    const unitTag = new vscode.TestTag('unit');
    const unitProfile = this.controller.createRunProfile(
      'Run Unit Tests',
      vscode.TestRunProfileKind.Run,
      async (request, token) => {
        await this.runner.runTests(request, token);
      },
      false, // Not default
      unitTag,
      true // Enable continuous run for unit tests
    );

    const integrationTag = new vscode.TestTag('integration');
    const integrationProfile = this.controller.createRunProfile(
      'Run Integration Tests',
      vscode.TestRunProfileKind.Run,
      async (request, token) => {
        await this.runner.runTests(request, token);
      },
      false,
      integrationTag,
      true // Enable continuous run for integration tests
    );

    const e2eTag = new vscode.TestTag('e2e');
    const e2eProfile = this.controller.createRunProfile(
      'Run E2E Tests',
      vscode.TestRunProfileKind.Run,
      async (request, token) => {
        await this.runner.runTests(request, token);
      },
      false,
      e2eTag,
      false // Disable continuous run for e2e (too slow)
    );
    
    this.context.subscriptions.push(
      runProfile, 
      debugProfile, 
      coverageProfile,
      unitProfile,
      integrationProfile,
      e2eProfile
    );
  }

  async initialize() {
    this.outputChannel.appendLine('Loading Mocha configuration...');
    await this.loadMochaConfig();
    this.outputChannel.appendLine('✓ Configuration loaded');

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

  private async loadMochaConfig() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.outputChannel.appendLine('  No workspace folders to load config from');
      return;
    }

    // Load config from first workspace folder
    const workspaceFolder = workspaceFolders[0];
    const loadedConfig = await this.configLoader.loadConfig(workspaceFolder);

    if (loadedConfig) {
      // Merge loaded config with defaults
      if (loadedConfig.timeout !== undefined) {
        // Convert string timeout (e.g., "2s") to number (milliseconds)
        this.config.timeout = typeof loadedConfig.timeout === 'string' 
          ? this.parseTimeout(loadedConfig.timeout) 
          : loadedConfig.timeout;
        this.outputChannel.appendLine(`  timeout: ${this.config.timeout}ms`);
      }
      if (loadedConfig.slow !== undefined) {
        this.config.slow = loadedConfig.slow;
        this.outputChannel.appendLine(`  slow: ${this.config.slow}ms`);
      }
      if (loadedConfig.bail !== undefined) {
        this.config.bail = loadedConfig.bail;
        this.outputChannel.appendLine(`  bail: ${this.config.bail}`);
      }
      if (loadedConfig.grep !== undefined) {
        // Convert RegExp to string for consistency
        this.config.grep = loadedConfig.grep instanceof RegExp 
          ? loadedConfig.grep.source 
          : loadedConfig.grep;
        this.outputChannel.appendLine(`  grep: ${this.config.grep}`);
      }
      if (loadedConfig.extension !== undefined) {
        // Convert to array and normalize extensions (remove leading dots)
        const extensions = Array.isArray(loadedConfig.extension) 
          ? loadedConfig.extension 
          : [loadedConfig.extension];
        
        this.config.extensions = extensions.map(ext => ext.replace(/^\./, ''));
        this.outputChannel.appendLine(`  extensions: ${this.config.extensions.join(', ')}`);
        
        // Extensions changed - need to re-setup file watchers
        this.outputChannel.appendLine('  ⚠️  Extensions changed - file watchers will be updated');
      }
      if (loadedConfig.retries !== undefined) {
        this.config.retries = loadedConfig.retries;
        this.outputChannel.appendLine(`  retries: ${this.config.retries}`);
      }
      if (loadedConfig.require !== undefined) {
        // Convert to array if single string
        this.config.require = Array.isArray(loadedConfig.require) 
          ? loadedConfig.require 
          : [loadedConfig.require];
        this.outputChannel.appendLine(`  require: ${this.config.require.join(', ')}`);
      }
      if (loadedConfig.ignore !== undefined) {
        // Convert to array if single string
        this.config.ignore = Array.isArray(loadedConfig.ignore) 
          ? loadedConfig.ignore 
          : [loadedConfig.ignore];
        this.outputChannel.appendLine(`  ignore: ${this.config.ignore.join(', ')}`);
      }

      // Update runner and coverage provider with loaded config
      this.runner.updateConfig(this.config);
      this.coverage.updateConfig(this.config);
      this.outputChannel.appendLine('  Configuration applied to runner and coverage provider');
    }
  }

  /**
   * Parse timeout string (e.g., "2s", "5000") to milliseconds
   */
  private parseTimeout(timeout: string): number {
    const match = timeout.match(/^(\d+)(s|ms)?$/);
    if (!match) {
      this.outputChannel.appendLine(`  ⚠️  Invalid timeout format: ${timeout}, using default`);
      return 5000;
    }
    
    const value = parseInt(match[1], 10);
    const unit = match[2] || 'ms';
    
    return unit === 's' ? value * 1000 : value;
  }

  /**
   * Get test file glob patterns based on configured extensions
   * Returns patterns like ['**\/*.test.{ts,js}', '**\/*.spec.{ts,js}']
   */
  private getTestFilePatterns(): string[] {
    const extensions = this.config.extensions || ['js', 'ts'];
    const extPattern = extensions.length === 1 ? extensions[0] : `{${extensions.join(',')}}`;
    
    return [
      `**/*.test.${extPattern}`,
      `**/*.spec.${extPattern}`
    ];
  }

  /**
   * Check if a URI is a test file based on configured extensions
   */
  private isTestFileUri(uri: vscode.Uri): boolean {
    const extensions = this.config.extensions || ['js', 'ts'];
    
    for (const ext of extensions) {
      if (uri.path.endsWith(`.test.${ext}`) || uri.path.endsWith(`.spec.${ext}`)) {
        return true;
      }
    }
    
    return false;
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
      // Watch for test files based on configured extensions
      const patterns = this.getTestFilePatterns();
      this.outputChannel.appendLine(`  Watching patterns: ${patterns.join(', ')}`);

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

    // Build exclude patterns: always exclude node_modules, plus any configured ignore patterns
    const excludePatterns = ['{**/node_modules/**'];
    if (this.config.ignore && this.config.ignore.length > 0) {
      this.outputChannel.appendLine(`  Ignore patterns: ${this.config.ignore.join(', ')}`);
      excludePatterns.push(...this.config.ignore.map(p => p));
    }
    const excludePattern = excludePatterns.length === 1 
      ? excludePatterns[0].slice(1) // Remove leading '{'
      : excludePatterns.join(',') + '}';

    for (const folder of workspaceFolders) {
      this.outputChannel.appendLine(`  Scanning folder: ${folder.uri.fsPath}`);
      const patterns = this.getTestFilePatterns();

      for (const pattern of patterns) {
        this.outputChannel.appendLine(`    Pattern: ${pattern}`);
        const files = await vscode.workspace.findFiles(
          new vscode.RelativePattern(folder, pattern),
          excludePattern
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
    return document.uri.scheme === 'file' && this.isTestFileUri(document.uri);
  }

  async refresh() {
    this.controller.items.replace([]);
    await this.discoverAllTests();
  }

  getConfig(): MochaConfig {
    return this.config;
  }

  /**
   * Run a specific test using grep pattern
   */
  async runTestWithGrep(testItem: vscode.TestItem, grepPattern: string): Promise<void> {
    this.outputChannel.appendLine(`Running test with grep pattern: ${grepPattern}`);
    
    // Store the current grep setting
    const originalGrep = this.config.grep;
    
    try {
      // Temporarily set the grep pattern
      this.config.grep = grepPattern;
      this.runner.updateConfig(this.config);
      this.coverage.updateConfig(this.config);
      
      // Find the root test item (file level)
      let rootItem = testItem;
      while (rootItem.parent) {
        rootItem = rootItem.parent;
      }
      
      // Create a test run request for this test
      const request = new vscode.TestRunRequest([rootItem]);
      
      // Run the test with the default profile
      await this.runner.runTests(request, new vscode.CancellationTokenSource().token);
    } finally {
      // Restore the original grep setting
      this.config.grep = originalGrep;
      this.runner.updateConfig(this.config);
      this.coverage.updateConfig(this.config);
    }
  }

  dispose() {
    this.controller.dispose();
    this.fileWatchers.forEach((w) => w.dispose());
  }
}
