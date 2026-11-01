# Security policy

ServerLab runs on your server and, for the Firewall and fail2ban pages, can make root-level changes through a small helper. Security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting instead: on the repository page, go to **Security → Report a vulnerability**.

Include what you found, how to reproduce it, and what an attacker could do with it. You should get a first reply within a week.

## Scope

Especially interesting:

- anything that lets a request reach `ufw` or `fail2ban-client` with arguments the validation should have refused, or run any other program as root;
- ways around the setup token, sign-in throttling or session checks;
- ways for the unprivileged `serverlab` user to influence what the root helper reads or writes;
- cross-site scripting or request forgery in the web UI.

ServerLab is designed to be reachable only over a Tailscale tailnet behind nginx ([docs/HARDENING.md](docs/HARDENING.md)). Issues that need the dashboard exposed to the public internet against that guide are still welcome, but rated lower.

## Supported versions

Fixes go into the latest release. Update with `git pull && sudo deploy/install.sh`.
