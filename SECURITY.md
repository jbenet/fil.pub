# Security

Found a security problem in fil.pub or `fp`? Please don't open a public pull request about it.
Send it through the feedback button on [fil.pub](https://fil.pub) (Alt+F on any page) and say it is a security report. Feedback goes to the maintainers, not to a
public page.

`fp` keeps your API keys in `~/.config/fp/keys.json` (mode 0600). Encrypted pubs are sealed on
your machine; the key stays in the link's `#k=` fragment and never reaches fil.pub.
