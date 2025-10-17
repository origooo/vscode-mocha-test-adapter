# Publishing Guide

## Prerequisites

1. Create publisher account at https://marketplace.visualstudio.com/manage
2. Get Personal Access Token from Azure DevOps

## Commands

```bash
# Option 1: Use yarn dlx (runs vsce without installing globally)
yarn dlx @vscode/vsce login origooo
# Enter your PAT when prompted

# Package the extension (creates .vsix file)
yarn dlx @vscode/vsce package --no-dependencies --skip-license

# Test locally by installing the .vsix
code --install-extension vscode-mocha-test-adapter-0.0.15.vsix

# Publish to marketplace
yarn dlx @vscode/vsce publish --no-dependencies --skip-license

# Option 2: Install vsce as dev dependency (recommended for CI/CD)
yarn add -D @vscode/vsce

# Then use with yarn:
yarn vsce login origooo
yarn vsce package --no-dependencies
yarn vsce publish --no-dependencies

# Publish a specific version bump
yarn dlx @vscode/vsce publish minor --no-dependencies  # 0.0.15 -> 0.1.0
yarn dlx @vscode/vsce publish patch --no-dependencies  # 0.0.15 -> 0.0.16
yarn dlx @vscode/vsce publish major --no-dependencies  # 0.0.15 -> 1.0.0
```

## What Gets Published

- All files except those in `.vscodeignore`
- Compiled JavaScript from `dist/`
- README.md, CHANGELOG.md, LICENSE
- Icon (if configured)

## After Publishing

Your extension will be available at:
- Marketplace: https://marketplace.visualstudio.com/items?itemName=origooo.vscode-mocha-test-adapter
- Users can install by searching "Mocha Test Adapter" in VS Code Extensions

## Updating

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Commit changes
4. Run `vsce publish`

## Unpublish

```bash
# Remove extension from marketplace
yarn dlx @vscode/vsce unpublish origooo.vscode-mocha-test-adapter
```
