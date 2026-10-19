// React and Ink must load after this default is set. The build keeps the CLI
// in a separate chunk so static dependency imports cannot run ahead of it.
process.env.NODE_ENV ??= 'production';
const { run } = await import('./cli.js');
await run(process.argv);
