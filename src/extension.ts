import * as vscode from 'vscode';
import { MochaTestController } from './mochaTestController.js';

let testController: MochaTestController | undefined;
let outputChannel: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext) {
  // Create output channel for logging
  outputChannel = vscode.window.createOutputChannel('Mocha Tests');
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
