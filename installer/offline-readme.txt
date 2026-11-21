===============================================================================
  ServerLab @VERSION@ - offline installer for Ubuntu 24.04 (x86_64)
===============================================================================

  Built @BUILT@ from @COMMIT@
  Contents: ServerLab @VERSION@, Node.js @NODE_VERSION@, @PACKAGE_COUNT@ Ubuntu packages,
            GeoIP database (@GEOIP@)

ServerLab is a small dashboard for one Ubuntu server: CPU, GPUs, memory,
temperatures, disks and network, the machine's hardware, uptime history,
apps and services, sign-ins, alerts, firewall and fail2ban.

This folder installs it on a server WITHOUT internet. Everything it needs is
here: Node.js, ServerLab with all its npm modules, the Ubuntu packages it uses
and the geolocation database.


-------------------------------------------------------------------------------
1. WHAT THE SERVER NEEDS
-------------------------------------------------------------------------------

  - Ubuntu Server 24.04 LTS on a 64-bit Intel or AMD CPU (x86_64).
    The installer refuses other releases and ARM; their packages differ.
  - A user who can run sudo.
  - 4 GB free in /var/tmp and 4 GB free in /opt.
  - 2 GB of RAM or more: the web app is built on the server during install.

Check with:
    lsb_release -d ; uname -m ; df -h /var/tmp /opt ; free -h


-------------------------------------------------------------------------------
2. INSTALL
-------------------------------------------------------------------------------

  1. Plug the USB drive into the server. On Ubuntu Server it is not mounted
     automatically. Find it and mount it:

         lsblk                           the USB drive, e.g. sdb with sdb1
         sudo mount /dev/sdb1 /mnt

     (exFAT drives mount out of the box on Ubuntu 24.04.)

  2. Run the installer:

         sudo bash /mnt/@BUNDLE@/install.sh

     Options:
         --app-port 3001    put the web app on another local port (default 3000)
         --verify           only check the files on the drive, change nothing
         --help             all options

  3. At the end it prints a SETUP URL and a one-time SETUP TOKEN. Keep them
     for step 3 below.

  4. Unmount the drive:   sudo umount /mnt

What the installer does, in order:
  - checks every file on the drive against SHA256SUMS (stops if one is damaged)
  - installs the Ubuntu packages from payload/debs (only the missing ones):
    sqlite3, dmidecode, rsync, curl, openssl, python3, pciutils, polkitd,
    nginx and tailscale, with their dependencies
  - installs Node.js @NODE_VERSION@ in /usr/local/lib/serverlab-node
    (/usr/local/bin/node, npm and npx point to it)
  - copies ServerLab to /opt/serverlab, builds it, creates the database and
    starts the services
  - installs the GeoIP database, so sign-ins show where they came from

nginx is installed but left STOPPED: it becomes the Tailscale gateway later
(step 4). If nginx was already on the server, it is not touched.


-------------------------------------------------------------------------------
3. FIRST SIGN-IN
-------------------------------------------------------------------------------

ServerLab only listens on the server itself (127.0.0.1:3000). Until Tailscale
and nginx are set up, reach it with an SSH tunnel from another computer on the
same network:

    ssh -L 3000:127.0.0.1:3000 <you>@<server-address>

then open http://localhost:3000/setup in Chrome or Firefox, paste the setup
token and choose the admin password.

Lost the token?   sudo cat /var/lib/serverlab/setup-token
Forgot the password later?   sudo serverlab reset-password


-------------------------------------------------------------------------------
4. TAILSCALE ACCESS (once the server has internet)
-------------------------------------------------------------------------------

Tailscale is already installed. It needs the network once to join your tailnet:

    sudo tailscale up

Then set nginx up as the tailnet gateway, as on your other ServerLab servers.
The full guide is on the server after install:

    less /opt/serverlab/docs/HARDENING.md
        section 2   Tailscale (MagicDNS and HTTPS certificates)
        section 3   nginx as the single tailnet gateway
        section 5   firewall, SSH and updates
        section 9   checks to verify the result


-------------------------------------------------------------------------------
5. UPDATE, UNDO, REMOVE
-------------------------------------------------------------------------------

Update to a newer version: build a new USB installer and run its install.sh
the same way. When ServerLab is already installed, it updates instead of
reinstalling. It backs up the database and the current version first, and
puts the old version back by itself if the update fails.

    sudo bash /opt/serverlab/deploy/update.sh --list-backups
    sudo bash /opt/serverlab/deploy/update.sh --rollback --keep-database

Remove ServerLab (data and settings are kept):
    sudo /opt/serverlab/deploy/install.sh --uninstall

Remove everything, data included:
    sudo /opt/serverlab/deploy/install.sh --uninstall --purge


-------------------------------------------------------------------------------
6. WHERE THINGS ARE
-------------------------------------------------------------------------------

    /opt/serverlab                    the app
    /var/lib/serverlab                database, setup token, GeoIP, backups
    /etc/serverlab/serverlab.env      settings (notification keys, ports)
    /usr/local/lib/serverlab-node     Node.js @NODE_VERSION@

    Services:   serverlab-web, serverlab-collector,
                serverlab-hardware-inventory (reads RAM slots once per boot)

    Status:     systemctl status serverlab-web serverlab-collector
    Logs:       journalctl -u serverlab-web -u serverlab-collector -f
    After editing serverlab.env:
                sudo systemctl restart serverlab-collector serverlab-web


-------------------------------------------------------------------------------
7. TROUBLESHOOTING
-------------------------------------------------------------------------------

"some files on the USB drive are damaged or missing"
    The copy on the drive is incomplete. Write the installer to the drive
    again, then run:  sudo bash install.sh --verify

"this bundle's packages are for Ubuntu 24.04"
    The server runs another release. Build an installer for it, or install
    with internet using installer/install.sh from the ServerLab source.

"need 4096 MB free in /var/tmp" (or /opt)
    Free some space, or grow the disk, and run install.sh again.

"the bundled database module does not load with this Node.js"
    Another Node.js is overriding the bundled one. Check:  which node
    It should print /usr/local/bin/node. Then run install.sh again.

The install stopped half-way
    Fix the cause shown on screen and run install.sh again. It is safe to
    repeat: finished steps are redone or skipped, and your data is kept.

The page does not load
    systemctl status serverlab-web
    curl -I http://127.0.0.1:3000/login       (should answer 200)
    journalctl -u serverlab-web -n 50


-------------------------------------------------------------------------------
8. WHAT IS IN THIS FOLDER
-------------------------------------------------------------------------------

    install.sh                        the installer (run with sudo bash)
    README.txt                        this file
    SHA256SUMS                        checksums of every file below
    payload/serverlab-app.tar.gz      ServerLab @VERSION@ and its npm modules
    payload/node-@NODE_VERSION@-linux-x64.tar.xz
                                      Node.js (the modules are built for it)
    payload/debs/                     Ubuntu 24.04 packages and their index
    payload/geoip/                    DB-IP City Lite database

Licences: ServerLab is MIT licensed. The GeoIP data is DB-IP City Lite,
https://db-ip.com, licensed under CC BY 4.0. Node.js and the Ubuntu packages
keep their own licences (see /usr/share/doc on the server after install).
