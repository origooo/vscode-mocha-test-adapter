import * as vscode from 'vscode';
import { MochaTestController } from './mochaTestController.js';

let testController: MochaTestController | undefined;
let outputChannel: vscode.OutputChannel;

/**
 * Get the full hierarchical name of a test (e.g., "Suite > Nested Suite > Test Name")
 */
function getFullTestName(testItem: vscode.TestItem): string {
  const parts: string[] = [];
  let current: vscode.TestItem | undefined = testItem;
  
  while (current) {
    // Skip file-level items (they usually have URIs and represent files)
    if (current.label && !current.uri) {
      parts.unshift(current.label);
    } else if (current.label && current !== testItem) {
      // Include file name if it's not the test item itself
      const fileName = current.uri?.path.split('/').pop() || current.label;
      parts.unshift(fileName);
    } else if (current === testItem) {
      parts.unshift(current.label);
    }
    current = current.parent;
  }
  
  return parts.join(' > ');
}

export async function activate(context: vscode.ExtensionContext) {
  // Create output channel for logging
  outputChannel = vscode.window.createOutputChannel('Mocha Tests Adapter');
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine('='.repeat(60));
  outputChannel.appendLine('Mocha Test Adapter activating...');
  outputChannel.appendLine('='.repeat(60));

  try {
    // Create the test controller
    outputChannel.appendLine('Creating test controller...');
    testController = new MochaTestController(context, outputChannel);
    outputChannel.appendLine('✓ Test controller created successfully');

    // Register the refresh command
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'mocha-extension.refreshTests',
        async () => {
          outputChannel.appendLine('Refresh command triggered');
          await testController?.refresh();
          vscode.window.showInformationMessage('Tests refreshed');
          outputChannel.appendLine('✓ Tests refreshed');
        }
      )
    );
    outputChannel.appendLine('✓ Refresh command registered');

    // Register the Go to Test command
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'mocha-extension.goToTest',
        async (testItem: vscode.TestItem) => {
          if (testItem.uri && testItem.range) {
            const document = await vscode.workspace.openTextDocument(testItem.uri);
            const editor = await vscode.window.showTextDocument(document);
            editor.selection = new vscode.Selection(testItem.range.start, testItem.range.start);
            editor.revealRange(testItem.range, vscode.TextEditorRevealType.InCenter);
            outputChannel.appendLine(`✓ Navigated to test: ${testItem.label}`);
          }
        }
      )
    );
    outputChannel.appendLine('✓ Go to Test command registered');

    // Register the Copy Test Name command
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'mocha-extension.copyTestName',
        async (testItem: vscode.TestItem) => {
          const fullName = getFullTestName(testItem);
          await vscode.env.clipboard.writeText(fullName);
          vscode.window.showInformationMessage(`Copied: ${fullName}`);
          outputChannel.appendLine(`✓ Copied test name: ${fullName}`);
        }
      )
    );
    outputChannel.appendLine('✓ Copy Test Name command registered');

    // Register the Run Only This Test command
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'mocha-extension.runTestWithGrep',
        async (testItem: vscode.TestItem) => {
          const testName = testItem.label;
          // Escape special regex characters
          const escapedName = testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          outputChannel.appendLine(`Running test with grep: ${escapedName}`);
          
          // Set the grep configuration and run the test
          await testController?.runTestWithGrep(testItem, escapedName);
          
          vscode.window.showInformationMessage(`Running: ${testName}`);
        }
      )
    );
    outputChannel.appendLine('✓ Run Only This Test command registered');

    // Register the Reveal in Explorer command
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'mocha-extension.revealInExplorer',
        async (testItem: vscode.TestItem) => {
          if (testItem.uri) {
            await vscode.commands.executeCommand('revealInExplorer', testItem.uri);
            outputChannel.appendLine(`✓ Revealed in explorer: ${testItem.uri.fsPath}`);
          }
        }
      )
    );
    outputChannel.appendLine('✓ Reveal in Explorer command registered');

    // Initialize test discovery
    outputChannel.appendLine('Initializing test discovery...');
    await testController.initialize();
    outputChannel.appendLine('✓ Test discovery initialized');
    outputChannel.appendLine('='.repeat(60));
    outputChannel.appendLine('Mocha Test Adapter is now active!');
    outputChannel.appendLine('='.repeat(60));
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    outputChannel.appendLine('');
    outputChannel.appendLine('❌ ERROR during activation:');
    outputChannel.appendLine(errorMessage);
    if (error instanceof Error && error.stack) {
      outputChannel.appendLine('');
      outputChannel.appendLine('Stack trace:');
      outputChannel.appendLine(error.stack);
    }
    outputChannel.show();
    throw error;
  }
}

export function deactivate() {
  outputChannel?.appendLine('Deactivating Mocha Test Adapter...');
  testController?.dispose();
  outputChannel?.appendLine('✓ Deactivated');
}
