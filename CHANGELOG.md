# Changelog

All notable changes to the "Mocha Test Adapter" extension will be documented in this file.

## [0.0.1] - 2025-10-16

### Added
- Initial release
- Automatic test discovery for `.test.ts`, `.spec.ts`, `.test.js`, and `.spec.js` files
- Integration with VS Code's native Testing API
- Support for running individual tests, test suites, and all tests
- Debug support with full source maps
- Real-time test discovery as files change
- File system watching for automatic test updates
- Command to manually refresh tests
- Support for nested `describe` blocks (test suites)
- TypeScript and JavaScript test file support
- Mocha test framework integration

### Technical Details
- Built with TypeScript using ESM modules
- Uses Yarn 4 with Plug'n'Play (PnP) for dependency management
- Configured with ESLint (flat config), Prettier, and TypeScript
- Full debugging support with source maps
- Implements VS Code Testing API (not the deprecated Test Explorer UI)

## Future Enhancements

Potential features for future releases:
- Code coverage support
- Test configuration UI
- Support for `.mocharc.json` configuration files
- Custom Mocha reporter options
- Test output formatting
- Performance improvements for large test suites
- Better error messages and diagnostics
- Support for test tags/filters
