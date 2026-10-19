import { createProgram, type CliDeps } from '../src/cli.js';

export async function runCli(args: string[], deps: CliDeps = {}): Promise<{ stdout: string; stderr: string; code: number }> {
  const out: string[] = [];
  const err: string[] = [];
  const program = createProgram({
    ...deps,
    stdout: (text) => {
      out.push(text);
      deps.stdout?.(text);
    },
    stderr: (text) => {
      err.push(text);
      deps.stderr?.(text);
    },
  });
  const output = {
    writeOut: (text: string) => out.push(text),
    writeErr: (text: string) => err.push(text),
  };
  const commands = [program, ...program.commands];
  for (const command of commands) {
    command.exitOverride();
    command.configureOutput(output);
  }
  let code = 0;
  try {
    await program.parseAsync(['node', 'mcp-atlas', ...args], { from: 'node' });
  } catch (error) {
    const exitCode = (error as { exitCode?: number }).exitCode;
    if (exitCode === undefined) throw error;
    code = exitCode;
  }
  return { stdout: out.join(''), stderr: err.join(''), code };
}
