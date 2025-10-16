import { describe, it } from 'mocha';
import * as assert from 'assert';

describe('Example Test Suite', () => {
  describe('Math operations', () => {
    it('should add two numbers correctly', () => {
      const result = 2 + 2;
      assert.strictEqual(result, 4);
    });

    it('should multiply two numbers correctly', () => {
      const result = 3 * 4;
      assert.strictEqual(result, 12);
    });

    it('should handle division', () => {
      const result = 10 / 2;
      assert.strictEqual(result, 5);
    });
  });

  describe('String operations', () => {
    it('should concatenate strings', () => {
      const result = 'Hello' + ' ' + 'World';
      assert.strictEqual(result, 'Hello World');
    });

    it('should convert to uppercase', () => {
      const result = 'hello'.toUpperCase();
      assert.strictEqual(result, 'HELLO');
    });
  });
});
