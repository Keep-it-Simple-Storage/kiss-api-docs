import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'KISS API Docs',
  tagline: 'API documentation for Keep It Simple Storage',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
  },

  url: 'https://docs.keepitsimplestorage.com',
  baseUrl: '/',

  organizationName: 'Keep-it-Simple-Storage',
  projectName: 'kiss-api-docs',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: ['docusaurus-node-polyfills'],

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexBlog: false,
        docsRouteBasePath: '/',
        highlightSearchTermsOnTargetPage: true,
        searchResultLimits: 8,
      },
    ],
  ],

  themeConfig: {
    image: 'img/social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Developer Portal',
      logo: {
        alt: 'KISS Logo',
        src: 'img/logo.svg',
        srcDark: 'img/logo-dark.svg',
        style: { height: '32px' },
      },
      items: [
        {
          type: 'search',
          position: 'right',
          className: 'navbar-search-centered',
        },
        {
          href: 'https://github.com/Keep-it-Simple-Storage',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
