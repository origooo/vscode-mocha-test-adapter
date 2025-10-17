import * as vscode from 'vscode';

/**
 * Manages diagnostic entries in the Problems panel for test failures.
 * Shows failed tests alongside ESLint, TypeScript, and other diagnostics.
 */
export class DiagnosticsProvider {
  private readonly diagnosticCollection: vscode.DiagnosticCollection;

  constructor(private readonly outputChannel: vscode.OutputChannel) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('mochaTests');
    this.outputChannel.appendLine('DiagnosticsProvider initialized');
  }

  /**
   * Add a diagnostic entry for a failed test
   * @param uri The URI of the test file
   * @param testName The name of the failed test
   * @param message The error message
   * @param line The line number where the test is defined (0-indexed)
   * @param stack Optional stack trace for more precise location
   */
  addTestFailure(
    uri: vscode.Uri,
    testName: string,
    message: string,
    line: number,
    stack?: string
  ): void {
    this.outputChannel.appendLine(`[Diagnostics] Adding test failure for: ${testName}`);
    this.outputChannel.appendLine(`[Diagnostics]   URI: ${uri.toString()}`);
    this.outputChannel.appendLine(`[Diagnostics]   Line: ${line}`);
    this.outputChannel.appendLine(`[Diagnostics]   Message: ${message}`);
    
    // Get existing diagnostics and create a new mutable array
    const existingDiagnostics = this.diagnosticCollection.get(uri) || [];
    const diagnostics = [...existingDiagnostics];
    
    // Try to extract more precise location from stack trace
    const location = this.parseStackLocation(stack, uri);
    const range = location || new vscode.Range(line, 0, line, Number.MAX_VALUE);

    const diagnostic = new vscode.Diagnostic(
      range,
      `Test failed: ${testName}\n${message}`,
      vscode.DiagnosticSeverity.Error
    );
    
    diagnostic.source = 'Mocha';
    diagnostic.code = 'test-failure';

    diagnostics.push(diagnostic);
    this.diagnosticCollection.set(uri, diagnostics);
    
    this.outputChannel.appendLine(`[Diagnostics] Total diagnostics for file: ${diagnostics.length}`);
  }

  /**
   * Clear diagnostics for a specific file when tests pass
   * @param uri The URI of the test file
   */
  clearFileDignostics(uri: vscode.Uri): void {
    this.outputChannel.appendLine(`[Diagnostics] Clearing diagnostics for: ${uri.toString()}`);
    this.diagnosticCollection.delete(uri);
  }

  /**
   * Clear all test diagnostics (e.g., before a new test run)
   */
  clearAllDiagnostics(): void {
    this.outputChannel.appendLine('[Diagnostics] Clearing all diagnostics');
    this.diagnosticCollection.clear();
  }

  /**
   * Parse stack trace to find the most relevant location
   * Returns a Range if a location is found, otherwise null
   */
  private parseStackLocation(stack: string | undefined, fileUri: vscode.Uri): vscode.Range | null {
    if (!stack) {
      return null;
    }

    // Stack trace format: "at Context.<anonymous> (file:///path/to/test.ts:10:5)"
    // or: "at /path/to/test.ts:10:5"
    const lines = stack.split('\n');
    
    for (const line of lines) {
      // Look for lines that reference the test file
      const match = line.match(/at\s+(?:.*?\s+)?\(?([^:]+):(\d+):(\d+)\)?/);
      if (match) {
        const [, filePath, lineStr, colStr] = match;
        
        // Check if this stack frame is from the test file we're interested in
        if (filePath.includes(fileUri.fsPath) || fileUri.fsPath.includes(filePath)) {
          const lineNum = parseInt(lineStr, 10) - 1; // Convert to 0-indexed
          const col = parseInt(colStr, 10) - 1;
          
          // Create a range that spans the whole line
          return new vscode.Range(lineNum, 0, lineNum, Number.MAX_VALUE);
        }
      }
    }

    return null;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.diagnosticCollection.dispose();
  }
}
