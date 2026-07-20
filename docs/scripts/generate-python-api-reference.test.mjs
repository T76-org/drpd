import assert from 'node:assert/strict';
import test from 'node:test';

import {
  methodsTable,
  propertiesTable,
  symbolSection,
} from './generate-python-api-reference.mjs';

test('renders synchronous and asynchronous methods as Python declarations', () => {
  const rendered = methodsTable([
    {
      name: 'close',
      kind: 'method',
      signature: '(self) -> None',
      docstring: 'Close the transport.',
      decorators: ['abstractmethod'],
    },
    {
      name: 'connect',
      kind: 'async method',
      signature: '(self) -> None',
      docstring: 'Connect to the transport.',
    },
  ]);

  assert.match(rendered, /`def close\(self\) -> None`/);
  assert.match(rendered, /`async def connect\(self\) -> None`/);
});

test('renders asynchronous functions with an async declaration', () => {
  const rendered = symbolSection('example', {
    name: 'discover',
    kind: 'async function',
    signature: '() -> list[str]',
    docstring: 'Discover devices.',
    decorators: ['retry'],
  });

  assert.match(rendered, /async def discover\(\) -> list\[str\]/);
  assert.match(rendered, /\*\*Decorators:\*\* `retry`/);
});

test('renders read-only and read-write properties without call syntax', () => {
  const rendered = propertiesTable([
    {
      name: 'connected',
      annotation: 'bool',
      docstring: 'Whether the transport is connected.',
      readable: true,
      writable: false,
    },
    {
      name: 'name',
      annotation: 'str',
      docstring: 'Configured name.',
      readable: true,
      writable: true,
    },
  ]);

  assert.match(rendered, /\| `connected` \| bool \| read-only \|/);
  assert.match(rendered, /\| `name` \| str \| read\/write \|/);
  assert.doesNotMatch(rendered, /connected\(/);
  assert.doesNotMatch(rendered, /name\(/);
});
