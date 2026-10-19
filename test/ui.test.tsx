import { render } from 'ink-testing-library';
import { expect, it } from 'vitest';
import { App, type WizardResult } from '../src/ui/App.js';
import { TreeSelect } from '../src/ui/TreeSelect.js';
import { catalog, filesystem, loose, server } from './fixture.js';

// Ink renders and reads keys asynchronously; a short delay flakes when the whole suite runs in parallel.
const tick = () => new Promise((resolve) => setTimeout(resolve, 100));
const books = catalog([filesystem(), loose()]);

it('ticks a whole theme from the tree and submits it', async () => {
  let submitted: string[] = [];
  const ui = render(<TreeSelect themes={books.themes} servers={books.servers} initialSearch="example" onSubmit={(ids) => (submitted = ids)} onCancel={() => {}} />);
  await tick();
  expect(ui.lastFrame()).toContain('Filesystem');
  ui.stdin.write(' ');
  await tick();
  ui.stdin.write('\r');
  await tick();
  expect(submitted.sort()).toEqual(['com.example/filesystem', 'com.example/loose']);
  ui.unmount();
});

it('hides servers with nothing to install with i', async () => {
  const empty = server({ id: 'com.example/empty', name: 'com.example/empty', title: 'Emptyish' });
  const ui = render(<TreeSelect themes={books.themes} servers={[...books.servers, empty]} initialSearch="example" onSubmit={() => {}} onCancel={() => {}} />);
  await tick();
  expect(ui.lastFrame()).toContain('Emptyish');
  ui.stdin.write('i');
  await tick();
  expect(ui.lastFrame()).not.toContain('Emptyish');
  expect(ui.lastFrame()).toContain('installable only');
  ui.unmount();
});

it('leaves out a server that fails the audit unless it is kept', async () => {
  const run = async (keys: string[]) => {
    let result: WizardResult | null = null;
    const ui = render(
      <App
        themes={books.themes}
        servers={books.servers}
        preset={{ agents: ['cursor'], scope: 'user' }}
        defaults={{ agents: [], scope: 'project' }}
        initialIds={['com.example/filesystem', 'com.example/loose']}
        onDone={(r) => (result = r)}
      />,
    );
    await tick();
    expect(ui.lastFrame()).toContain('com.example/loose');
    for (const key of keys) {
      ui.stdin.write(key);
      await tick();
    }
    ui.unmount();
    return result as WizardResult | null;
  };
  expect((await run(['\r']))?.ids).toEqual(['com.example/filesystem']);
  expect((await run([' ', '\r']))?.ids).toEqual(['com.example/filesystem', 'com.example/loose']);
});
