// What `fp help` and `fp <command> -h` print. The docs page shows HELP (web/src/screens/Docs.tsx),
// so the commands and flags are documented in one place.

/** Each command: its usage line, what it does, and its flags (none of them has subcommands). */
export const COMMANDS = {
  put: {
    usage: 'fp put <file|dir|->... [flags]',
    summary: ['publish files, a folder, or stdin (-); prints its link'],
    about: `Publishes files, a folder, or stdin (-). Signed in, the pub is named for the file or
folder (fp put plbgs: <handle>/plbgs; fp put notes/deploy.md: <handle>/deploy), as the
web composer suggests; a name you already have gets a new version, and one another
account holds gets -2, -3... Stdin, several files, --encrypt and --anon pubs are named by
their short code. Prints the pub's name link on stdout, and its short, word, /ipfs/ and
gateway links on stderr, so \`fp put x | pbcopy\` copies the one link.`,
    flags: [
      ['--name <name>', 'publish as <handle>/<name>, or its next version'],
      ['--no-name', 'name it by its short code, not the file or folder'],
      ['--message <text>', 'the version\'s message'],
      ['--filename <name>', 'file name for stdin (default paste.txt)'],
      ['--encrypt', 'encrypt one file on this machine; the key is in the link\'s #k='],
      ['--password', 'with --encrypt: the link without the key opens with a password', 'too (asked for, or FP_PASSWORD; the server never sees it)'],
      ['--unlisted', 'keep it out of your list (any link still works, its name too)'],
      ['--private', 'only you can open it on fil.pub (needs a key; its bytes', 'on Filecoin stay public unless --encrypt)'],
      ['--listed', 'without a key: show it on fil.pub/anonymous'],
      ['--anon', 'leave it unsigned: it lives under anonymous/'],
      ['--expires <1d|7d|30d|never>', 'delete it after this long (anonymous: at most 30d,', 'the default; never needs a key)'],
      ['--burn', 'read once: the first full read deletes it (one file)'],
      ['--keep-meta', 'keep photo metadata (camera, time, GPS); stripped by default'],
      ['--json', 'print the whole record as JSON'],
      ['#', 'Only these links, one a line in the order given, and nothing else (not even on stderr):'],
      ['--name-link', 'fil.pub/<handle>/<name> (with #k= when encrypted)'],
      ['--short-link', 'fil.pub/s/<code>'],
      ['--word-link', 'fil.pub/w/<three-words>'],
      ['--ipfs-link', 'fil.pub/ipfs/<cid>/'],
      ['--gateway-link', 'the pub on the public IPFS gateway (<cid>.ipfs.inbrowser.link)'],
      ['--cid', 'the CID alone'],
      ['--delete-token', 'the delete token (anonymous pubs; an empty line otherwise)'],
    ],
  },
  ls: {
    usage: 'fp ls [flags]',
    summary: ['list your pubs, newest first'],
    flags: [
      ['--since <30m|24h|7d>', 'only pubs newer than this'],
      ['--type <text|image|files>', 'only this kind'],
      ['--json', 'print JSON'],
    ],
  },
  get: {
    usage: 'fp get <cid|url> [path] [flags]',
    summary: ['write a pub\'s file to stdout: a CID, its /ipfs/, name, /s/ or', '/w/ link (decrypts #k= links)'],
    flags: [
      ['--key <AGE1...>', 'key of an encrypted pub (or pass the whole #k= link)'],
      ['--password', 'open a password pub without its key (asked for, or FP_PASSWORD)'],
    ],
  },
  open: { usage: 'fp open <cid|name|url>', summary: ['open a pub in the browser'], flags: [] },
  rm: {
    usage: 'fp rm <name|link> [flags]',
    summary: ['delete a pub, every version, here and on Filecoin', '(--token for an anonymous one)'],
    flags: [['--token <fpd_...>', 'the delete token fp put printed for an anonymous pub', '(signed in instead: any of your pubs)']],
  },
  unpublish: {
    usage: 'fp unpublish <name|link> [flags]',
    summary: ['stop serving a pub, every version; it stays stored'],
    flags: [['--token <fpd_...>', 'the delete token fp put printed for an anonymous pub', '(signed in instead: any of your pubs)']],
  },
  republish: {
    usage: 'fp republish <name|link> [flags]',
    summary: ['serve an unpublished pub again'],
    flags: [['--token <fpd_...>', 'the delete token fp put printed for an anonymous pub', '(signed in instead: any of your pubs)']],
  },
  login: { usage: 'fp login [fp_live_...]', summary: ['sign in with your account\'s API key (from Settings > API keys;', 'asks for it, or reads stdin); saved per deployment'], flags: [] },
  logout: { usage: 'fp logout', summary: ['revoke the saved key and forget it'], flags: [] },
  whoami: { usage: 'fp whoami', summary: ['the account fp publishes as'], flags: [] },
  help: { usage: 'fp help [command]', summary: ['this text, or one command\'s'], flags: [] },
};

const pad = (s, n) => (s.length >= n ? `${s}  ` : s.padEnd(n));
const W = 28;
function flagLines(flags) {
  // ['#', text]: a heading for the flags after it.
  return flags.flatMap(([f, ...d]) => (f === '#' ? ['', `  ${d[0]}`] : d.map((line, i) => `  ${pad(i ? '' : f, W - 2)}${line}`.trimEnd())));
}
const ENV = `Environment
  FP_API_KEY, FP_KEY        an API key from Settings > API keys (fp_live_...), instead of
                            the one fp login saved in ~/.config/fp/keys.json. Without one,
                            fp put publishes anonymously: text only (1 MB a file),
                            unlisted, at fil.pub/anonymous/<code>, kept 30 days;
                            fp put prints a delete token for fp rm
  FP_ORIGIN                 another fil.pub deployment (default https://fil.pub)`;

/** `fp <command> -h`: its usage, what it does, and its flags. */
export function commandHelp(name) {
  const c = COMMANDS[name];
  const out = [`Usage: ${c.usage}`, '', c.about || c.summary.join(' ').replace(/^./, (s) => s.toUpperCase()) + '.'];
  out.push('', 'Subcommands: none');
  out.push('', 'Flags', `  ${pad('-h, --help', W - 2)}this help`, ...flagLines(c.flags));
  return out.join('\n');
}

const SHARED = new Set(['unpublish', 'republish']); // their flags are rm's, listed once
export const HELP = `fp publishes to fil.pub from the command line.

Commands
${Object.entries(COMMANDS).flatMap(([, c]) => c.summary.map((line, i) => `  ${pad(i ? '' : c.usage.replace(/ \[flags\]$/, ''), W - 2)}${line}`)).join('\n')}

Every command takes -h or --help for its own usage and flags.
${Object.entries(COMMANDS).filter(([n, c]) => c.flags.length && !SHARED.has(n)).map(([n, c]) => `\n${n === 'rm' ? 'rm, unpublish, republish' : n}\n${flagLines(c.flags).join('\n')}`).join('\n')}

${ENV}

fp put prints the one main link on stdout and everything else on stderr, so
\`fp put x | pbcopy\` works.`;
