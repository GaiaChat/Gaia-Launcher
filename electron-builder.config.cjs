const updateBaseUrl = process.env.GAIA_UPDATE_BASE_URL || process.env.GAIA_UPDATE_URL || '';
const releasePageUrl =
  process.env.GAIA_RELEASES_URL ||
  (updateBaseUrl
    ? updateBaseUrl.replace(/\/latest\/download\/?$/u, '/latest').replace(/\/download\/?$/u, '')
    : 'https://github.com/GaiaChat/Gaia-Launcher/releases/latest');
const appIcon = 'src/assets/appicon/gaia_app_icon.png';
const linuxIconSet = 'src/assets/appicon/linux';
const windowsIcon = 'src/assets/appicon/win/icon.ico';

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.gaia.launcher',
  productName: 'Gaia Launcher',
  executableName: 'GaiaLauncher',
  copyright: 'Copyright 2026 Gaia Launcher',
  directories: {
    output: 'release-app',
  },
  icon: appIcon,
  files: ['dist/**/*', 'package.json'],
  extraMetadata: {
    main: 'dist/main/main.js',
    gaia: {
      releasePageUrl,
      updateBaseUrl,
    },
  },
  asar: true,
  publish: updateBaseUrl
    ? [
        {
          provider: 'generic',
          url: updateBaseUrl,
        },
      ]
    : null,
  linux: {
    maintainer: 'Gaia Launcher <gaia-launcher@example.invalid>',
    vendor: 'Gaia Launcher',
    target: [
      {
        target: 'AppImage',
        arch: ['x64'],
      },
      {
        target: 'deb',
        arch: ['x64'],
      },
      {
        target: 'rpm',
        arch: ['x64'],
      },
      {
        target: 'pacman',
        arch: ['x64'],
      },
      {
        target: 'tar.gz',
        arch: ['x64'],
      },
    ],
    category: 'Network',
    icon: linuxIconSet,
    artifactName: 'GaiaLauncher-${version}-${arch}.${ext}',
    desktop: {
      entry: {
        Name: 'Gaia Launcher',
        StartupWMClass: 'GaiaLauncher',
        Comment: 'Desktop launcher for Current servers and Bluesky messages',
      },
    },
  },
  mac: {
    icon: appIcon,
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64'],
      },
      {
        target: 'zip',
        arch: ['x64', 'arm64'],
      },
    ],
    category: 'public.app-category.social-networking',
    artifactName: 'GaiaLauncher-${version}-mac-${arch}.${ext}',
  },
  win: {
    icon: windowsIcon,
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
      {
        target: 'zip',
        arch: ['x64'],
      },
    ],
    artifactName: 'GaiaLauncher-${version}-win-${arch}.${ext}',
  },
  appImage: {
    artifactName: 'GaiaLauncher-${version}-${arch}.${ext}',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: windowsIcon,
    uninstallerIcon: windowsIcon,
    shortcutName: 'Gaia Launcher',
  },
  deb: {
    packageName: 'gaia-launcher',
  },
  rpm: {
    packageName: 'gaia-launcher',
  },
  pacman: {
    packageName: 'gaia-launcher',
  },
};
