import { expect, it } from 'vitest';
import { createProgram } from '../src/cli.js';

it('names itself in the help', () => {
  const help = createProgram().helpInformation();
  expect(help).toContain('mcp-atlas');
  expect(help).toContain('--offline');
  expect(help).toContain('--refresh');
  expect(help).toContain('12 hour');
});

it('parses the catalog flags', () => {
  const program = createProgram();
  program.exitOverride();
  program.configureOutput({ writeOut() {}, writeErr() {} });
  program.parseOptions(['--offline', '--refresh', '--catalog', 'snapshot.json.gz']);
  expect(program.opts()).toMatchObject({ offline: true, refresh: true, catalog: 'snapshot.json.gz' });
});
