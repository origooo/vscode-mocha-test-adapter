import * as vscode from 'vscode';

enum ItemType {
  File,
  Suite,
  Test,
}

interface TestData {
  type: ItemType;
  line?: number;
}

export class TestDiscovery {
  private tagMap: Map<string, vscode.TestTag> = new Map();

  constructor(
    private readonly controller: vscode.TestController,
    private readonly testData: WeakMap<vscode.TestItem, TestData>,
    private readonly outputChannel: vscode.OutputChannel
  ) {
    // Initialize common test tags
    this.getOrCreateTag('unit');
    this.getOrCreateTag('integration');
    this.getOrCreateTag('e2e');
    this.getOrCreateTag('slow');
    this.getOrCreateTag('skip');
  }

  private getOrCreateTag(id: string): vscode.TestTag {
    let tag = this.tagMap.get(id);
    if (!tag) {
      tag = new vscode.TestTag(id);
      this.tagMap.set(id, tag);
    }
    return tag;
  }

  private extractTags(text: string): vscode.TestTag[] {
    const tags: vscode.TestTag[] = [];
    
    // Match [tag] or @tag patterns
    const bracketTags = text.match(/\[(\w+)\]/g);
    const atTags = text.match(/@(\w+)/g);
    
    if (bracketTags) {
      for (const match of bracketTags) {
        const tagName = match.slice(1, -1).toLowerCase(); // Remove [ and ]
        tags.push(this.getOrCreateTag(tagName));
      }
    }
    
    if (atTags) {
      for (const match of atTags) {
        const tagName = match.slice(1).toLowerCase(); // Remove @
        tags.push(this.getOrCreateTag(tagName));
      }
    }
    
    return tags;
  }

  async parseTestFile(uri: vscode.Uri): Promise<void> {
    this.outputChannel.appendLine(`Parsing test file: ${uri.fsPath}`);

    // Get or create the file test item
    const fileItem = this.getOrCreateFile(uri);

    try {
      // Read the file content
      const content = await vscode.workspace.fs.readFile(uri);
      const text = new TextDecoder().decode(content);

      // Parse the file to find tests
      this.parseFileContent(fileItem, text);
      this.outputChannel.appendLine(
        `✓ Parsed ${uri.fsPath} (${fileItem.children.size} items)`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(
        `❌ Error parsing test file ${uri.fsPath}: ${errorMessage}`
      );
      if (error instanceof Error && error.stack) {
        this.outputChannel.appendLine(error.stack);
      }
    }
  }

  async resolveTestItem(item: vscode.TestItem): Promise<void> {
    const data = this.testData.get(item);
    if (!data) {
      return;
    }

    // If it's a file and hasn't been parsed yet, parse it now
    if (data.type === ItemType.File && item.children.size === 0) {
      if (item.uri) {
        await this.parseTestFile(item.uri);
      }
    }
  }

  private getOrCreateFile(uri: vscode.Uri): vscode.TestItem {
    const id = uri.toString();
    const existing = this.controller.items.get(id);
    if (existing) {
      return existing;
    }

    const fileName = uri.path.split('/').pop() || uri.path;
    const fileItem = this.controller.createTestItem(id, fileName, uri);
    fileItem.canResolveChildren = true;

    this.testData.set(fileItem, { type: ItemType.File });
    this.controller.items.add(fileItem);

    return fileItem;
  }

  private parseFileContent(fileItem: vscode.TestItem, content: string): void {
    // Clear existing children
    fileItem.children.replace([]);

    const lines = content.split('\n');
    const suiteStack: vscode.TestItem[] = [fileItem];

    // Regular expressions to match Mocha test structures
    const describeRegex = /^\s*(describe|context)\s*\(\s*['"`]([^'"`]+)['"`]/;
    const itRegex = /^\s*it\s*\(\s*['"`]([^'"`]+)['"`]/;
    const suiteEndRegex = /^\s*\}\s*\)/;

    let currentIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith('//')) {
        continue;
      }

      // Match describe/context blocks
      const describeMatch = line.match(describeRegex);
      if (describeMatch) {
        const suiteName = describeMatch[2];
        const indent = line.search(/\S/);

        // Adjust the suite stack based on indentation
        while (
          suiteStack.length > 1 &&
          indent <= currentIndent &&
          suiteStack.length > 1
        ) {
          suiteStack.pop();
          currentIndent -= 2;
        }

        const parent = suiteStack[suiteStack.length - 1];
        const suiteId = `${parent.id}/${suiteName}`;
        const suiteItem = this.controller.createTestItem(
          suiteId,
          suiteName,
          fileItem.uri
        );

        const range = new vscode.Range(i, 0, i, line.length);
        suiteItem.range = range;

        // Extract and assign tags
        const tags = this.extractTags(suiteName);
        if (tags.length > 0) {
          suiteItem.tags = tags;
        }

        this.testData.set(suiteItem, { type: ItemType.Suite, line: i });
        parent.children.add(suiteItem);

        suiteStack.push(suiteItem);
        currentIndent = indent;
        continue;
      }

      // Match it() test cases
      const itMatch = line.match(itRegex);
      if (itMatch) {
        const testName = itMatch[1];
        const parent = suiteStack[suiteStack.length - 1];
        const testId = `${parent.id}/${testName}`;
        const testItem = this.controller.createTestItem(
          testId,
          testName,
          fileItem.uri
        );

        const range = new vscode.Range(i, 0, i, line.length);
        testItem.range = range;

        // Extract and assign tags from test name
        const tags = this.extractTags(testName);
        
        // Inherit tags from parent suite
        const parentTags = parent.tags || [];
        const allTags = [...parentTags, ...tags];
        
        if (allTags.length > 0) {
          testItem.tags = allTags;
        }

        this.testData.set(testItem, { type: ItemType.Test, line: i });
        parent.children.add(testItem);
        continue;
      }

      // Detect closing braces to pop from suite stack
      if (suiteEndRegex.test(line) && suiteStack.length > 1) {
        const indent = line.search(/\S/);
        if (indent <= currentIndent && suiteStack.length > 1) {
          suiteStack.pop();
          currentIndent = Math.max(0, currentIndent - 2);
        }
      }
    }
  }
}
