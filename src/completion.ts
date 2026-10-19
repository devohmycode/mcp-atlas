/**
 * Shell completion. The scripts only pass the words typed so far to
 * `mcp-atlas __complete -- <words>`. Choosing candidates happens here, offline.
 */

export const FILES = '__files__';
const SHELLS = ['bash', 'zsh', 'fish', 'powershell'];

export interface CompletionCommand {
  name: string;
  options: string[];
}

const AGENT_VALUES = new Set(['-a', '--agent']);
const THEME_VALUES = new Set(['-t', '--theme']);
const ID_COMMANDS = new Set(['show', 'install', 'uninstall', 'update']);
const FILE_COMMANDS = new Set(['import']);

export interface CompletionContext {
  /** Commands and their flags, read from the program so that they never drift. */
  commands: readonly CompletionCommand[];
  globalOptions: readonly string[];
  themes: () => string[];
  clients: string[];
  /** Catalog ids from the local snapshot. Must not touch the network. */
  ids: (prefix: string) => string[];
}

export function complete(words: string[], ctx: CompletionContext): string[] {
  const current = words.at(-1) ?? '';
  const before = words.slice(0, -1);
  const starts = (list: readonly string[]) => list.filter((item) => item.toLowerCase().startsWith(current.toLowerCase()));
  const command = before.find((word, index) => !word.startsWith('-') && !AGENT_VALUES.has(before[index - 1] ?? '') && !THEME_VALUES.has(before[index - 1] ?? ''));
  const lastOption = [...before].reverse().find((word) => word.startsWith('-'));
  if (lastOption && AGENT_VALUES.has(lastOption) && !current.startsWith('-')) return starts(ctx.clients);
  if (lastOption && THEME_VALUES.has(lastOption) && !current.startsWith('-')) return starts(ctx.themes());
  if (current.startsWith('-')) {
    const own = ctx.commands.find((item) => item.name === command)?.options ?? [];
    return starts([...own, ...ctx.globalOptions]);
  }
  if (!command) return starts(ctx.commands.map((item) => item.name));
  if (ID_COMMANDS.has(command)) return ctx.ids(current);
  if (FILE_COMMANDS.has(command)) return [FILES];
  if (command === 'completion') return starts(SHELLS);
  return [];
}

/** The script to load in a shell's startup file. `undefined` when `shell` is unknown. */
export function completionScript(shell: string): string | undefined {
  switch (shell) {
    case 'bash':
      return `# mcp-atlas completion — add to ~/.bashrc: eval "$(mcp-atlas completion bash)"
_mcp_atlas() {
  local IFS=$'\\n' line="\${COMP_LINE:0:COMP_POINT}" words cur out pre
  IFS=' ' read -ra words <<< "$line"
  [[ "$line" == *' ' ]] && words+=('')
  cur="\${words[\${#words[@]}-1]}"
  out=$("\${words[0]}" __complete -- "\${words[@]:1}" 2>/dev/null)
  if [[ "$out" == ${FILES} ]]; then COMPREPLY=($(compgen -f -- "$cur")); return; fi
  pre="\${cur%"\${cur##*[@:]}"}"
  COMPREPLY=($(printf '%s\\n' "$out" | sed "s|^$pre||"))
}
complete -F _mcp_atlas mcp-atlas
`;
    case 'zsh':
      return `# mcp-atlas completion — add to ~/.zshrc: eval "$(mcp-atlas completion zsh)"
_mcp_atlas() {
  local -a cands
  cands=("\${(@f)$(\${words[1]} __complete -- "\${(@)words[2,CURRENT]}" 2>/dev/null)}")
  if [[ "\${cands[1]}" == ${FILES} ]]; then _files; else compadd -- "\${cands[@]}"; fi
}
compdef _mcp_atlas mcp-atlas
`;
    case 'fish':
      return `# mcp-atlas completion — add to ~/.config/fish/config.fish: mcp-atlas completion fish | source
function __mcp_atlas_complete
  set -l tokens (commandline -opc) (commandline -ct)
  set -l out ($tokens[1] __complete -- $tokens[2..-1] 2>/dev/null)
  if test "$out[1]" = ${FILES}
    __fish_complete_path (commandline -ct)
  else
    printf '%s\\n' $out
  end
end
complete -c mcp-atlas -f -a '(__mcp_atlas_complete)'
`;
    case 'powershell':
      return `# mcp-atlas completion — add to $PROFILE: mcp-atlas completion powershell | Out-String | Invoke-Expression
Register-ArgumentCompleter -Native -CommandName mcp-atlas -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $words = @($commandAst.CommandElements | Select-Object -Skip 1 | ForEach-Object { $_.ToString() })
  if ($wordToComplete -eq '') { $words += '' }
  $out = @(& mcp-atlas __complete -- @words 2>$null)
  if ($out.Count -eq 0 -or $out[0] -eq '${FILES}') { return }
  $out | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
}
`;
    default:
      return undefined;
  }
}
