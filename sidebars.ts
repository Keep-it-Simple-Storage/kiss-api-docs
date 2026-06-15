import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

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
      label: 'Integration guides',
      collapsible: false,
      items: ['guides/pms/quickstart', 'guides/white-label/quickstart'],
    },
    {
      type: 'category',
      label: 'Reference',
      collapsible: false,
      items: ['guides/error-handling'],
    },
  ],
};

export default sidebars;
