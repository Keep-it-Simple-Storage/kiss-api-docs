import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';
import referenceSidebar from './docs/reference/sidebar';

const sidebars: SidebarsConfig = {
  guidesSidebar: [
    {
      type: 'category',
      label: 'Getting started',
      collapsible: false,
      items: ['intro', 'guides/concepts', 'guides/authentication'],
    },
    {
      type: 'category',
      label: 'Guides',
      collapsible: false,
      items: ['guides/pms/quickstart', 'guides/white-label/quickstart'],
    },
    {
      type: 'category',
      label: 'Essentials',
      collapsible: false,
      items: ['guides/error-handling', 'guides/rate-limits'],
    },
    {
      type: 'category',
      label: 'API Reference',
      collapsible: false,
      items: referenceSidebar,
    },
  ],
};

export default sidebars;
