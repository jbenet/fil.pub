# fp, the fil.pub command line

Generated from `fp help` and `fp <command> -h`.

```
fp publishes to fil.pub from the command line.

Commands
  fp put <file|dir|->...    publish files, a folder, or stdin (-); prints its link
  fp ls                     list your pubs, newest first
  fp get <cid|url> [path]   write a pub's file to stdout: a CID, its /ipfs/, name, /s/ or
                            /w/ link (decrypts #k= links)
  fp open <cid|name|url>    open a pub in the browser
  fp rm <name|link>         delete a pub, every version, here and on Filecoin
                            (--token for an anonymous one)
  fp unpublish <name|link>  stop serving a pub, every version; it stays stored
  fp republish <name|link>  serve an unpublished pub again
  fp login [fp_live_...]    sign in with your account's API key (from Settings > API keys;
                            asks for it, or reads stdin); saved per deployment
  fp logout                 revoke the saved key and forget it
  fp whoami                 the account fp publishes as
  fp help [command]         this text, or one command's

Every command takes -h or --help for its own usage and flags.

put
  --name <name>             publish as <handle>/<name>, or its next version
  --no-name                 name it by its short code, not the file or folder
  --message <text>          the version's message
  --filename <name>         file name for stdin (default paste.txt)
  --encrypt                 encrypt one file on this machine; the key is in the link's #k=
  --password                with --encrypt: the link without the key opens with a password
                            too (asked for, or FP_PASSWORD; the server never sees it)
  --unlisted                keep it out of your list (any link still works, its name too)
  --private                 only you can open it on fil.pub (needs a key; its bytes
                            on Filecoin stay public unless --encrypt)
  --listed                  without a key: show it on fil.pub/anonymous
  --anon                    leave it unsigned: it lives under anonymous/
  --expires <1d|7d|30d|never>  delete it after this long (anonymous: at most 30d,
                            the default; never needs a key)
  --burn                    read once: the first full read deletes it (one file)
  --keep-meta               keep photo metadata (camera, time, GPS); stripped by default
  --json                    print the whole record as JSON

  Only these links, one a line in the order given, and nothing else (not even on stderr):
  --name-link               fil.pub/<handle>/<name> (with #k= when encrypted)
  --short-link              fil.pub/s/<code>
  --word-link               fil.pub/w/<three-words>
  --ipfs-link               fil.pub/ipfs/<cid>/
  --gateway-link            the pub on the public IPFS gateway (<cid>.ipfs.inbrowser.link)
  --cid                     the CID alone
  --delete-token            the delete token (anonymous pubs; an empty line otherwise)

ls
  --since <30m|24h|7d>      only pubs newer than this
  --type <text|image|files> only this kind
  --json                    print JSON

get
  --key <AGE1...>           key of an encrypted pub (or pass the whole #k= link)
  --password                open a password pub without its key (asked for, or FP_PASSWORD)

rm, unpublish, republish
  --token <fpd_...>         the delete token fp put printed for an anonymous pub
                            (signed in instead: any of your pubs)

Environment
  FP_API_KEY, FP_KEY        an API key from Settings > API keys (fp_live_...), instead of
                            the one fp login saved in ~/.config/fp/keys.json. Without one,
                            fp put publishes anonymously: text only (1 MB a file),
                            unlisted, at fil.pub/anonymous/<code>, kept 30 days;
                            fp put prints a delete token for fp rm
  FP_ORIGIN                 another fil.pub deployment (default https://fil.pub)

fp put prints the one main link on stdout and everything else on stderr, so
`fp put x | pbcopy` works.
```

## fp put

```
Usage: fp put <file|dir|->... [flags]

Publishes files, a folder, or stdin (-). Signed in, the pub is named for the file or
folder (fp put plbgs: <handle>/plbgs; fp put notes/deploy.md: <handle>/deploy), as the
web composer suggests; a name you already have gets a new version, and one another
account holds gets -2, -3... Stdin, several files, --encrypt and --anon pubs are named by
their short code. Prints the pub's name link on stdout, and its short, word, /ipfs/ and
gateway links on stderr, so `fp put x | pbcopy` copies the one link.

Subcommands: none

Flags
  -h, --help                this help
  --name <name>             publish as <handle>/<name>, or its next version
  --no-name                 name it by its short code, not the file or folder
  --message <text>          the version's message
  --filename <name>         file name for stdin (default paste.txt)
  --encrypt                 encrypt one file on this machine; the key is in the link's #k=
  --password                with --encrypt: the link without the key opens with a password
                            too (asked for, or FP_PASSWORD; the server never sees it)
  --unlisted                keep it out of your list (any link still works, its name too)
  --private                 only you can open it on fil.pub (needs a key; its bytes
                            on Filecoin stay public unless --encrypt)
  --listed                  without a key: show it on fil.pub/anonymous
  --anon                    leave it unsigned: it lives under anonymous/
  --expires <1d|7d|30d|never>  delete it after this long (anonymous: at most 30d,
                            the default; never needs a key)
  --burn                    read once: the first full read deletes it (one file)
  --keep-meta               keep photo metadata (camera, time, GPS); stripped by default
  --json                    print the whole record as JSON

  Only these links, one a line in the order given, and nothing else (not even on stderr):
  --name-link               fil.pub/<handle>/<name> (with #k= when encrypted)
  --short-link              fil.pub/s/<code>
  --word-link               fil.pub/w/<three-words>
  --ipfs-link               fil.pub/ipfs/<cid>/
  --gateway-link            the pub on the public IPFS gateway (<cid>.ipfs.inbrowser.link)
  --cid                     the CID alone
  --delete-token            the delete token (anonymous pubs; an empty line otherwise)
```

## fp ls

```
Usage: fp ls [flags]

List your pubs, newest first.

Subcommands: none

Flags
  -h, --help                this help
  --since <30m|24h|7d>      only pubs newer than this
  --type <text|image|files> only this kind
  --json                    print JSON
```

## fp get

```
Usage: fp get <cid|url> [path] [flags]

Write a pub's file to stdout: a CID, its /ipfs/, name, /s/ or /w/ link (decrypts #k= links).

Subcommands: none

Flags
  -h, --help                this help
  --key <AGE1...>           key of an encrypted pub (or pass the whole #k= link)
  --password                open a password pub without its key (asked for, or FP_PASSWORD)
```

## fp open

```
Usage: fp open <cid|name|url>

Open a pub in the browser.

Subcommands: none

Flags
  -h, --help                this help
```

## fp rm

```
Usage: fp rm <name|link> [flags]

Delete a pub, every version, here and on Filecoin (--token for an anonymous one).

Subcommands: none

Flags
  -h, --help                this help
  --token <fpd_...>         the delete token fp put printed for an anonymous pub
                            (signed in instead: any of your pubs)
```

## fp unpublish

```
Usage: fp unpublish <name|link> [flags]

Stop serving a pub, every version; it stays stored.

Subcommands: none

Flags
  -h, --help                this help
  --token <fpd_...>         the delete token fp put printed for an anonymous pub
                            (signed in instead: any of your pubs)
```

## fp republish

```
Usage: fp republish <name|link> [flags]

Serve an unpublished pub again.

Subcommands: none

Flags
  -h, --help                this help
  --token <fpd_...>         the delete token fp put printed for an anonymous pub
                            (signed in instead: any of your pubs)
```

## fp login

```
Usage: fp login [fp_live_...]

Sign in with your account's API key (from Settings > API keys; asks for it, or reads stdin); saved per deployment.

Subcommands: none

Flags
  -h, --help                this help
```

## fp logout

```
Usage: fp logout

Revoke the saved key and forget it.

Subcommands: none

Flags
  -h, --help                this help
```

## fp whoami

```
Usage: fp whoami

The account fp publishes as.

Subcommands: none

Flags
  -h, --help                this help
```

## fp help

```
Usage: fp help [command]

This text, or one command's.

Subcommands: none

Flags
  -h, --help                this help
```
