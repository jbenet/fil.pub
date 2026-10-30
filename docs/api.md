# The fil.pub API

Generated from [https://fil.pub/openapi.json](https://fil.pub/openapi.json) (also [openapi.json](../openapi.json) here).
Write calls take `Authorization: Bearer fp_live_…`, an API key from Settings → API keys.

| Method | Path | Key | What it does |
| --- | --- | --- | --- |
| `GET` | `/api/pubs` | no | List pubs (listed only, unless authenticated) |
| `POST` | `/api/pubs` | optional | Publish files. With no key: an anonymous text pub (text only, 1 MB a file) |
| `POST` | `/` | optional | Publish like POST /api/pubs, answering the link as plain text (curl -F file=@x) |
| `GET` | `/oembed` | no | oEmbed for a pub link |
| `GET` | `/api/pubs/{id}` | no | One pub with storage status |
| `PATCH` | `/api/pubs/{id}` | yes | Change listed / pinned |
| `GET` | `/api/search` | no | Full-text search |
| `GET` | `/api/names` | no | Named pubs |
| `GET` | `/api/names/{name}` | no | A name with all versions (410 once it expired, was read once or deleted) |
| `DELETE` | `/api/names/{name}` | optional | Delete a name and all its versions: X-Delete-Token (anonymous publisher) or a write key |
| `POST` | `/api/names/{name}/unpublish` | optional | Stop serving a name and all its versions; it stays stored and can be republished (its account, or X-Delete-Token) |
| `POST` | `/api/pubs/{id}/rename` | yes | Rename a pub, every version, without a new version; the old name redirects (its account) |
| `POST` | `/api/names/{name}/republish` | optional | Serve an unpublished name again |
| `POST` | `/api/report` | no | Report a pub, or agree/disagree with a flag |

## With curl and no account

```
fil.pub: paste anything, get a link that lasts. Stored on Filecoin, linkable on IPFS.

Publish text with no account:
  curl -F file=@notes.md https://fil.pub
  echo 'hello' | curl -F 'file=@-;filename=hello.txt' https://fil.pub
  curl --data-binary @crash.log 'https://fil.pub?filename=crash.log'

It prints the link (https://fil.pub/anonymous/<code>). Add -F listed=1 to show it on https://fil.pub/anonymous.

Text only (plain text, code, Markdown; no images, video or websites), at most 1 MB a file and 10 files a pub. Each network may publish 30 pubs an hour and 50 MB a day.
Anonymous pubs are public to anyone with the link, and can't be edited.
They are deleted after 30 days (-F expires=7d or 1d for sooner; -F burn=1: read once, the first
read deletes it). curl -i shows X-Delete-Token; delete with
  curl -X DELETE -H 'X-Delete-Token: fpd_…' https://fil.pub/api/names/<code>

More: https://fil.pub/docs · https://fil.pub/llms.txt · https://fil.pub/openapi.json
```

More: [https://fil.pub/docs](https://fil.pub/docs) and [llms.txt](../llms.txt).
