import type {ReactNode} from 'react';
import Content from '@theme-original/DocItem/Content';
import type ContentType from '@theme/DocItem/Content';
import type {WrapperProps} from '@docusaurus/types';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import CopyPageDropdown from '@site/src/components/CopyPageDropdown';
import styles from './styles.module.css';

type Props = WrapperProps<typeof ContentType>;

// Wraps the doc content to add the "Copy page" / LLM actions toolbar on guide
// pages. Skipped on generated reference pages (they're machine-readable via
// the OpenAPI spec and offer a spec download).
export default function ContentWrapper(props: Props): ReactNode {
  const {metadata} = useDoc();
  const showActions = !metadata.permalink.startsWith('/reference');
  return (
    <>
      {showActions && (
        <div className={styles.toolbar}>
          <CopyPageDropdown />
        </div>
      )}
      <Content {...props} />
    </>
  );
}
