import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as os from 'os';

interface CoverageData {
  coverageDir: string;
  fileCoverageMap: Map<string, vscode.FileCoverage>;
}

interface MochaConfig {
  timeout: number;
  grep?: string;
  slow: number;
  bail: boolean;
  retries?: number;
  require?: string[];
  ignore?: string[];
  extensions?: string[]; // e.g., ['js', 'ts', 'mjs']
}

export class CoverageProvider {
  private coverageDataMap = new WeakMap<vscode.TestRun, CoverageData>();
  private config: MochaConfig = {
    timeout: 5000,
    slow: 75,
    bail: false,
  };

  constructor(private readonly outputChannel: vscode.OutputChannel) {}

  updateConfig(config: MochaConfig): void {
    this.config = config;
  }

  /**
   * Get the path to the c8 binary.
   * In PnP environments, uses 'yarn bin c8' to resolve the virtual path.
   * In traditional environments, returns the standard node_modules path.
   */
  private async getC8Path(workspacePath: string, isPnP: boolean): Promise<string> {
    if (!isPnP) {
      // Non-PnP environment, use traditional node_modules path
      const c8Path = path.join(workspacePath, 'node_modules', 'c8', 'bin', 'c8.js');
      
      // Verify c8 exists
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(c8Path));
        return c8Path;
      } catch {
        throw new Error(
          'c8 not found in workspace. Please install it for coverage support: npm install --save-dev c8'
        );
      }
    }

    // PnP environment, use 'yarn bin c8' to get the path
    return new Promise((resolve, reject) => {
      const child = spawn('yarn', ['bin', 'c8'], {
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
          const c8Path = stdout.trim();
          resolve(c8Path);
        } else {
          reject(new Error(
            'c8 not found in workspace. Please install it for coverage support: yarn add -D c8'
          ));
        }
      });

      child.on('error', (error) => {
        reject(new Error(
          `Failed to locate c8: ${error.message}. Please install it: yarn add -D c8`
        ));
      });
    });
  }

  /**
   * Run tests with coverage using c8
   * Returns the Mocha JSON output for test result parsing
   */
  async runTestsWithCoverage(
    mochaPath: string,
    testFilePath: string,
    workspacePath: string,
    run: vscode.TestRun,
    nodeArgs: string[],
    isPnP: boolean,
    token: vscode.CancellationToken
  ): Promise<string> {
    // Create a temporary directory for coverage output
    const coverageDir = path.join(
      os.tmpdir(),
      `vscode-mocha-coverage-${Date.now()}`
    );

    this.outputChannel.appendLine(`  Coverage output directory: ${coverageDir}`);

    try {
      // Ensure coverage directory exists
      await fs.mkdir(coverageDir, { recursive: true });

      // Get c8 path
      const c8Path = await this.getC8Path(workspacePath, isPnP);
      this.outputChannel.appendLine(`  ✓ c8 path: ${c8Path}`);

      // Build c8 command arguments
      // c8 needs to wrap 'node' execution, so we tell it to run: node <mocha> <test-file>
      const extensions = this.config.extensions || ['js', 'ts'];
      const extPattern = extensions.length === 1 ? extensions[0] : `{${extensions.join(',')}}`;
      
      const c8Args = [
        ...nodeArgs,
        c8Path,
        '--reporter=json',
        '--reporter=text',
        `--reports-dir=${coverageDir}`,
        '--all',
        `--exclude=**/*.test.${extPattern}`,
        `--exclude=**/*.spec.${extPattern}`,
        '--exclude=**/node_modules/**',
        '--exclude=.*', // Ignore all hidden folders and e.g. .mocharc.js, .pnp* etc
        'node',  // c8 wraps node execution
        mochaPath,
        testFilePath,
        '--reporter',
        'json',
        '--ui',
        'bdd',
        '--timeout',
        this.config.timeout.toString(),
        '--slow',
        this.config.slow.toString(),
      ];
      
      // Add grep pattern if configured
      if (this.config.grep) {
        c8Args.push('--grep', this.config.grep);
      }
      
      // Add bail if configured
      if (this.config.bail) {
        c8Args.push('--bail');
      }

      this.outputChannel.appendLine(
        `  Running with coverage: node ${c8Args.join(' ')}`
      );

      const stdout = await new Promise<string>((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        const child = spawn('node', c8Args, {
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

        child.on('close', async (code) => {
          this.outputChannel.appendLine(
            `  Coverage process exited with code ${code}`
          );

          try {
            // Load and process coverage data
            await this.loadCoverageData(coverageDir, workspacePath, run);
            resolve(stdout); // Return stdout for test result parsing
          } catch (error) {
            this.outputChannel.appendLine(
              `  ⚠ Failed to load coverage data: ${error}`
            );
            resolve(stdout); // Still return stdout even if coverage parsing fails
          }
        });

        child.on('error', (error) => {
          this.outputChannel.appendLine(
            `  ❌ Failed to spawn coverage process: ${error.message}`
          );
          reject(error);
        });

        if (token.isCancellationRequested) {
          child.kill();
          reject(new Error('Coverage cancelled'));
        }

        token.onCancellationRequested(() => {
          child.kill();
          reject(new Error('Coverage cancelled'));
        });
      });

      // Store coverage data for detailed loading
      const fileCoverageMap = new Map<string, vscode.FileCoverage>();
      this.coverageDataMap.set(run, { coverageDir, fileCoverageMap });

      // Clean up coverage directory when run is disposed
      run.onDidDispose(async () => {
        try {
          await fs.rm(coverageDir, { recursive: true, force: true });
          this.outputChannel.appendLine(
            `  ✓ Cleaned up coverage directory: ${coverageDir}`
          );
        } catch (error) {
          this.outputChannel.appendLine(
            `  ⚠ Failed to clean up coverage directory: ${error}`
          );
        }
      });

      // Return the Mocha JSON output for test result parsing
      return stdout;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(
        `  ❌ Coverage error: ${errorMessage}`
      );
      throw error;
    }
  }

  /**
   * Load coverage data from c8 output
   */
  private async loadCoverageData(
    coverageDir: string,
    workspacePath: string,
    run: vscode.TestRun
  ): Promise<void> {
    // First, let's see what files c8 actually created
    try {
      const files = await fs.readdir(coverageDir);
      this.outputChannel.appendLine(
        `  Coverage directory contains: ${files.join(', ')}`
      );
    } catch (error) {
      this.outputChannel.appendLine(
        `  ⚠ Could not read coverage directory: ${error}`
      );
    }

    // c8 creates coverage-final.json with raw V8 coverage data
    const coverageFinalPath = path.join(coverageDir, 'coverage-final.json');
    
    this.outputChannel.appendLine(
      `  Reading coverage from: ${coverageFinalPath}`
    );

    try {
      const content = await fs.readFile(coverageFinalPath, 'utf-8');
      const coverageData = JSON.parse(content);

      this.outputChannel.appendLine(
        `  Found coverage for ${Object.keys(coverageData).length} file(s)`
      );

      // Process each file's coverage
      for (const [filePath, fileData] of Object.entries(coverageData)) {
        // Skip if not in workspace
        if (!filePath.startsWith(workspacePath)) {
          continue;
        }

        // Parse the V8 coverage data
        const data = fileData as {
          path: string;
          statementMap: Record<string, any>;
          fnMap: Record<string, any>;
          branchMap: Record<string, any>;
          s: Record<string, number>;
          f: Record<string, number>;
          b: Record<string, number[]>;
        };

        // Calculate coverage stats
        const statementCount = Object.keys(data.s || {}).length;
        const coveredStatements = Object.values(data.s || {}).filter(count => count > 0).length;
        
        const functionCount = Object.keys(data.f || {}).length;
        const coveredFunctions = Object.values(data.f || {}).filter(count => count > 0).length;
        
        const branchCount = Object.values(data.b || {}).reduce((sum, branches) => sum + branches.length, 0);
        const coveredBranches = Object.values(data.b || {}).reduce(
          (sum, branches) => sum + branches.filter(count => count > 0).length,
          0
        );

        const fileUri = vscode.Uri.file(filePath);
        
        // Log the raw data for debugging
        this.outputChannel.appendLine(
          `    ${path.relative(workspacePath, filePath)}:`
        );
        this.outputChannel.appendLine(
          `      Statements: ${coveredStatements}/${statementCount} (${statementCount > 0 ? Math.round((coveredStatements / statementCount) * 100) : 0}%)`
        );
        this.outputChannel.appendLine(
          `      Branches: ${coveredBranches}/${branchCount} (${branchCount > 0 ? Math.round((coveredBranches / branchCount) * 100) : 0}%)`
        );
        this.outputChannel.appendLine(
          `      Functions: ${coveredFunctions}/${functionCount} (${functionCount > 0 ? Math.round((coveredFunctions / functionCount) * 100) : 0}%)`
        );

        // Ensure covered <= total (sanity check)
        const safeStatements = Math.min(coveredStatements, statementCount);
        const safeBranches = Math.min(coveredBranches, branchCount);
        const safeFunctions = Math.min(coveredFunctions, functionCount);

        // Create FileCoverage object
        // TestCoverageCount takes (covered, total), not (covered, uncovered)!
        const fileCoverage = new vscode.FileCoverage(
          fileUri,
          new vscode.TestCoverageCount(
            safeStatements,
            statementCount  // Total, not uncovered
          ),
          new vscode.TestCoverageCount(
            safeBranches,
            branchCount  // Total, not uncovered
          ),
          new vscode.TestCoverageCount(
            safeFunctions,
            functionCount  // Total, not uncovered
          )
        );

        // Store for detailed loading
        const coverageDataMap = this.coverageDataMap.get(run);
        if (coverageDataMap) {
          coverageDataMap.fileCoverageMap.set(filePath, fileCoverage);
        }

        // Add to test run
        run.addCoverage(fileCoverage);
      }

      this.outputChannel.appendLine('  ✓ Coverage data loaded successfully');
    } catch (error) {
      this.outputChannel.appendLine(
        `  ⚠ Failed to read coverage data: ${error}`
      );
      throw error;
    }
  }

  /**
   * Load detailed coverage for a specific file
   */
  async loadDetailedCoverage(
    testRun: vscode.TestRun,
    fileCoverage: vscode.FileCoverage,
    token: vscode.CancellationToken
  ): Promise<vscode.FileCoverageDetail[]> {
    const data = this.coverageDataMap.get(testRun);
    if (!data) {
      this.outputChannel.appendLine(
        '  ⚠ No coverage data found for this test run'
      );
      return [];
    }

    const filePath = fileCoverage.uri.fsPath;
    const coverageDir = data.coverageDir;

    this.outputChannel.appendLine(
      `  Loading detailed coverage for: ${filePath}`
    );

    try {
      // Read the detailed coverage file
      const coverageJsonPath = path.join(coverageDir, 'coverage-final.json');
      const content = await fs.readFile(coverageJsonPath, 'utf-8');
      const coverageData = JSON.parse(content);

      const fileData = coverageData[filePath];
      if (!fileData) {
        this.outputChannel.appendLine(
          `  ⚠ No detailed coverage found for: ${filePath}`
        );
        return [];
      }

      const details: vscode.FileCoverageDetail[] = [];

      // Process statement coverage
      if (fileData.statementMap && fileData.s) {
        for (const [stmtId, count] of Object.entries(fileData.s)) {
          const loc = fileData.statementMap[stmtId];
          if (loc) {
            const range = new vscode.Range(
              loc.start.line - 1,
              loc.start.column,
              loc.end.line - 1,
              loc.end.column
            );

            details.push(
              new vscode.StatementCoverage(
                count as number,
                range,
                [] // branches, if any
              )
            );
          }
        }
      }

      // Process function coverage
      if (fileData.fnMap && fileData.f) {
        for (const [fnId, count] of Object.entries(fileData.f)) {
          const fnData = fileData.fnMap[fnId];
          if (fnData) {
            const range = new vscode.Range(
              fnData.loc.start.line - 1,
              fnData.loc.start.column,
              fnData.loc.end.line - 1,
              fnData.loc.end.column
            );

            details.push(
              new vscode.DeclarationCoverage(
                fnData.name || `(anonymous ${fnId})`,
                count as number,
                range
              )
            );
          }
        }
      }

      this.outputChannel.appendLine(
        `  ✓ Loaded ${details.length} coverage details`
      );

      return details;
    } catch (error) {
      this.outputChannel.appendLine(
        `  ⚠ Failed to load detailed coverage: ${error}`
      );
      return [];
    }
  }
}
