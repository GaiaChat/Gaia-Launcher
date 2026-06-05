# Gaia Launcher Updates

Gaia publishes Electron Builder update metadata for Windows, macOS, and Linux release assets. The primary Linux updater target is the AppImage. It is the best fit for Fedora, Bazzite, Arch, CachyOS, Debian, Ubuntu, and smaller distros because it updates in user space without depending on `dnf`, `rpm-ostree`, `pacman`, or `apt`.

## Release Build

Set `GAIA_UPDATE_BASE_URL` to the static folder that will host the Electron Builder update metadata and artifacts, then build:

```sh
GAIA_UPDATE_BASE_URL="https://example.com/gaia/releases/latest/download" pnpm release:linux
```

Upload these files from `release-app/` to the same URL:

- `latest.yml` or prerelease-channel `beta.yml` for Windows
- `latest-mac.yml` or prerelease-channel `beta-mac.yml` for macOS
- `latest-linux.yml`
- the matching `GaiaLauncher-<version>-win-x64.*`, `GaiaLauncher-<version>-mac-*.*`, and `GaiaLauncher-<version>-x86_64.AppImage` artifacts
- the `.deb`, `.rpm`, `.pacman`, and `.tar.gz` artifacts if you want native Linux package downloads too

`GAIA_RELEASES_URL` can be set to a human-facing releases page. Gaia opens that page whenever the current package cannot install the update itself.

The release script always builds the AppImage first. It skips the RPM artifact when `rpmbuild` is not installed on the build machine, because Fedora and Bazzite users can still use the self-updating AppImage.

## Linux Behavior

- AppImage builds check, download, replace, and relaunch from inside Gaia.
- Native `.deb`, `.rpm`, and `.pacman` builds are published for distro-native installs, but may still require system authorization.
- Flatpak, Snap, and immutable package-manager installs should use their store or package manager and Gaia will offer the release page as a fallback.

## macOS and Windows Behavior

- macOS builds read `beta-mac.yml` or `latest-mac.yml` from the configured feed URL and download the matching `.zip` or `.dmg` artifacts.
- Windows builds read `beta.yml` or `latest.yml` from the configured feed URL and download the matching installer artifacts.
- The release workflow sets `GAIA_UPDATE_BASE_URL` to `https://github.com/GaiaChat/Gaia-Launcher/releases/latest/download`, so packaged clients check the latest GitHub release metadata for their channel.
