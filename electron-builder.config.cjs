const updateBaseUrl = process.env.GAIA_UPDATE_BASE_URL || process.env.GAIA_UPDATE_URL || '';
const releasePageUrl =
  process.env.GAIA_RELEASES_URL ||
  (updateBaseUrl
    ? updateBaseUrl.replace(/\/latest\/download\/?$/u, '/latest').replace(/\/download\/?$/u, '')
    : 'https://github.com/MinecraftOldschoolEdition/Gaia-Launcher/releases/latest');

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.gaia.launcher',
  productName: 'Gaia Launcher',
  executableName: 'GaiaLauncher',
  copyright: 'Copyright 2026 Gaia Launcher',
  directories: {
    output: 'release-app',
  },
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
    icon: 'src/assets/appicon/gaia_app_icon.png',
    artifactName: 'GaiaLauncher-${version}-${arch}.${ext}',
    desktop: {
      entry: {
        Name: 'Gaia Launcher',
        StartupWMClass: 'GaiaLauncher',
        Comment: 'Desktop launcher for Current servers and Bluesky messages',
      },
    },
  },
  appImage: {
    artifactName: 'GaiaLauncher-${version}-${arch}.${ext}',
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
