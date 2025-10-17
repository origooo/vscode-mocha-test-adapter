# Publishing Guide

## Prerequisites

1. Create publisher account at https://marketplace.visualstudio.com/manage
2. Get Personal Access Token from Azure DevOps

## Commands

```bash
# Install vsce globally
npm install -g @vscode/vsce

# Login to publisher account
vsce login origo
# Enter your PAT when prompted

# Package the extension (creates .vsix file)
vsce package

# Publish to marketplace
vsce publish

# Or do both in one command
vsce publish

# Publish a specific version
vsce publish minor  # 0.0.15 -> 0.1.0
vsce publish patch  # 0.0.15 -> 0.0.16
vsce publish major  # 0.0.15 -> 1.0.0
```

## What Gets Published

- All files except those in `.vscodeignore`
- Compiled JavaScript from `dist/`
- README.md, CHANGELOG.md, LICENSE
- Icon (if configured)

## After Publishing

Your extension will be available at:
- Marketplace: https://marketplace.visualstudio.com/items?itemName=origo.vscode-mocha-test-adapter
- Users can install by searching "Mocha Test Adapter" in VS Code Extensions

## Updating

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Commit changes
4. Run `vsce publish`

## Unpublish

```bash
# Remove extension from marketplace
vsce unpublish origo.vscode-mocha-test-adapter
```
