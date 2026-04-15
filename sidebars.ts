import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';
import apiSidebar from './docs/api-reference/sidebar';

const sidebars: SidebarsConfig = {
  guidesSidebar: [
    'intro',
    'guides/concepts',
    'guides/authentication',
    'guides/white-label/quickstart',
    'guides/pms/quickstart',
    'guides/error-handling',
  ],
  apiReferenceSidebar: apiSidebar.filter(
    (item: any) => !(item.type === 'doc' && item.id === 'api-reference/kiss-api')
  ),
};

export default sidebars;
