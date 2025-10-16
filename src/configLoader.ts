import * as vscode from 'vscode';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';

/**
 * Complete Mocha configuration interface matching all CLI options.
 * See: https://mochajs.org/#configuring-mocha-nodejs
 */
export interface MochaConfigFile {
  // Test behavior
  allowUncaught?: boolean;
  asyncOnly?: boolean;
  bail?: boolean;
  checkLeaks?: boolean;
  delay?: boolean;
  dryRun?: boolean;
  exit?: boolean;
  passOnFailingTestSuite?: boolean;
  failZero?: boolean;
  forbidOnly?: boolean;
  forbidPending?: boolean;
  global?: string | string[];
  retries?: number;
  slow?: number;
  timeout?: number | string;

  // File handling
  extension?: string | string[];
  file?: string | string[];
  ignore?: string | string[];
  recursive?: boolean;
  require?: string | string[];
  sort?: boolean;
  watch?: boolean;
  watchFiles?: string | string[];
  watchIgnore?: string | string[];

  // Test filtering
  fgrep?: string;
  grep?: string | RegExp;
  invert?: boolean;

  // Parallel execution
  parallel?: boolean;
  jobs?: number;

  // Reporting
  color?: boolean;
  diff?: boolean;
  fullTrace?: boolean;
  inlineDiffs?: boolean;
  reporter?: string;
  reporterOption?: Record<string, unknown>;
  reporterOptions?: Record<string, unknown>;

  // Interface
  ui?: string;

  // Node.js & V8 options
  nodeOption?: string | string[];

  // Configuration
  config?: string | false;
  package?: string | false;

  // Advanced
  spec?: string | string[];
  
  // Index signature for any additional options
  [key: string]: unknown;
}

/**
 * Loads Mocha configuration from various config file formats.
 * Supports: .mocharc.js, .mocharc.cjs, .mocharc.json, .mocharc.jsonc, .mocharc.yaml, .mocharc.yml, package.json
 */
export class ConfigLoader {
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  /**
   * Find and load Mocha configuration from workspace
   */
  async loadConfig(workspaceFolder: vscode.WorkspaceFolder): Promise<MochaConfigFile | null> {
    this.outputChannel.appendLine('Looking for Mocha configuration files...');

    // Priority order according to Mocha docs
    const configFiles = [
      '.mocharc.js',
      '.mocharc.cjs',
      '.mocharc.yaml',
      '.mocharc.yml',
      '.mocharc.jsonc',
      '.mocharc.json',
    ];

    // Try each config file in priority order
    for (const configFile of configFiles) {
      const configPath = path.join(workspaceFolder.uri.fsPath, configFile);
      const configUri = vscode.Uri.file(configPath);

      try {
        await vscode.workspace.fs.stat(configUri);
        this.outputChannel.appendLine(`  Found config file: ${configFile}`);

        const config = await this.loadConfigFile(configPath);
        if (config) {
          this.outputChannel.appendLine(`  ✓ Loaded configuration from ${configFile}`);
          return config;
        }
      } catch {
        // File doesn't exist, try next
        continue;
      }
    }

    // Try package.json
    const packageJsonPath = path.join(workspaceFolder.uri.fsPath, 'package.json');
    const packageJsonUri = vscode.Uri.file(packageJsonPath);

    try {
      await vscode.workspace.fs.stat(packageJsonUri);
      const config = await this.loadFromPackageJson(packageJsonPath);
      if (config) {
        this.outputChannel.appendLine(`  ✓ Loaded configuration from package.json`);
        return config;
      }
    } catch {
      // No package.json
    }

    this.outputChannel.appendLine('  No Mocha configuration file found (using defaults)');
    return null;
  }

  /**
   * Load configuration from a specific file
   */
  private async loadConfigFile(configPath: string): Promise<MochaConfigFile | null> {
    const ext = path.extname(configPath);

    try {
      if (ext === '.js' || ext === '.cjs') {
        return await this.loadJavaScriptConfig(configPath);
      } else if (ext === '.json' || ext === '.jsonc') {
        return await this.loadJsonConfig(configPath);
      } else if (ext === '.yaml' || ext === '.yml') {
        return await this.loadYamlConfig(configPath);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`  ⚠️  Error loading config file: ${errorMessage}`);
      if (error instanceof Error && error.stack) {
        this.outputChannel.appendLine(error.stack);
      }
    }

    return null;
  }

  /**
   * Load JavaScript config file (.mocharc.js, .mocharc.cjs)
   */
  private async loadJavaScriptConfig(configPath: string): Promise<MochaConfigFile | null> {
    const ext = path.extname(configPath);
    
    try {
      // For .cjs files, use require (CommonJS) directly
      if (ext === '.cjs') {
        // Create require function from current module context
        const requireFromPath = createRequire(import.meta.url);
        
        // Clear require cache in case file changed
        const resolvedPath = requireFromPath.resolve(configPath);
        if (requireFromPath.cache[resolvedPath]) {
          delete requireFromPath.cache[resolvedPath];
        }
        
        const config = requireFromPath(configPath);
        
        // If it's a function, call it
        if (typeof config === 'function') {
          return await Promise.resolve(config());
        }
        
        return config;
      }
      
      // For .js files, try dynamic import (ESM)
      const fileUrl = pathToFileURL(configPath).href;
      
      try {
        const module = await import(fileUrl);
        const config = module.default || module;
        
        // If it's a function, call it
        if (typeof config === 'function') {
          return await Promise.resolve(config());
        }
        
        return config;
      } catch (importError) {
        // If import fails, try require as fallback
        const requireFromPath = createRequire(import.meta.url);
        const resolvedPath = requireFromPath.resolve(configPath);
        
        if (requireFromPath.cache[resolvedPath]) {
          delete requireFromPath.cache[resolvedPath];
        }
        
        const config = requireFromPath(configPath);
        
        if (typeof config === 'function') {
          return await Promise.resolve(config());
        }
        
        return config;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`  Error loading JavaScript config: ${errorMessage}`);
      
      // Provide helpful error message for common ESM/CJS conflicts
      if (errorMessage.includes('require is not defined') || errorMessage.includes('module is not defined')) {
        this.outputChannel.appendLine(`  ℹ️  Hint: If your package.json has "type": "module", rename .mocharc.js to .mocharc.cjs`);
        this.outputChannel.appendLine(`     The .cjs extension forces CommonJS mode (module.exports/require syntax)`);
        this.outputChannel.appendLine(`     Or use ESM syntax: export default { ... } in .mocharc.js`);
      }
      
      return null;
    }
  }

  /**
   * Load JSON config file (.mocharc.json, .mocharc.jsonc)
   */
  private async loadJsonConfig(configPath: string): Promise<MochaConfigFile | null> {
    try {
      const content = await vscode.workspace.fs.readFile(vscode.Uri.file(configPath));
      const text = Buffer.from(content).toString('utf8');
      
      // Remove comments for JSONC support (simple approach)
      const jsonText = text
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
        .replace(/\/\/.*/g, ''); // Remove // comments
      
      return JSON.parse(jsonText);
    } catch (error) {
      this.outputChannel.appendLine(`  Error parsing JSON config: ${error}`);
      return null;
    }
  }

  /**
   * Load YAML config file (.mocharc.yaml, .mocharc.yml)
   */
  private async loadYamlConfig(configPath: string): Promise<MochaConfigFile | null> {
    try {
      const content = await vscode.workspace.fs.readFile(vscode.Uri.file(configPath));
      const text = Buffer.from(content).toString('utf8');
      
      // Try to use a YAML parser if available in the workspace
      // Otherwise, return null and suggest installing yaml package
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const yaml = require('yaml');
        return yaml.parse(text);
      } catch {
        try {
          // Try js-yaml as alternative
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const yaml = require('js-yaml');
          return yaml.load(text);
        } catch {
          this.outputChannel.appendLine('  ⚠️  YAML config file found but no YAML parser available');
          this.outputChannel.appendLine('     Install "yaml" or "js-yaml" package to use YAML config');
          return null;
        }
      }
    } catch (error) {
      this.outputChannel.appendLine(`  Error loading YAML config: ${error}`);
      return null;
    }
  }

  /**
   * Load configuration from package.json
   */
  private async loadFromPackageJson(packageJsonPath: string): Promise<MochaConfigFile | null> {
    try {
      const content = await vscode.workspace.fs.readFile(vscode.Uri.file(packageJsonPath));
      const text = Buffer.from(content).toString('utf8');
      const packageJson = JSON.parse(text);
      
      if (packageJson.mocha) {
        this.outputChannel.appendLine('  Found "mocha" property in package.json');
        return packageJson.mocha;
      }
    } catch (error) {
      this.outputChannel.appendLine(`  Error reading package.json: ${error}`);
    }
    
    return null;
  }

  /**
   * Merge loaded config with existing config
   */
  mergeConfig(existingConfig: MochaConfigFile, loadedConfig: MochaConfigFile): MochaConfigFile {
    return {
      ...existingConfig,
      ...loadedConfig,
      // For arrays, concatenate instead of replacing
      require: this.mergeArrayConfig(existingConfig.require, loadedConfig.require),
      extension: this.mergeArrayConfig(existingConfig.extension, loadedConfig.extension),
      ignore: this.mergeArrayConfig(existingConfig.ignore, loadedConfig.ignore),
    };
  }

  /**
   * Helper to merge array-type config options
   */
  private mergeArrayConfig(
    existing: string | string[] | undefined,
    loaded: string | string[] | undefined
  ): string[] | undefined {
    const existingArr = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
    const loadedArr = loaded ? (Array.isArray(loaded) ? loaded : [loaded]) : [];
    
    const merged = [...loadedArr, ...existingArr]; // Loaded takes priority
    return merged.length > 0 ? merged : undefined;
  }
}
