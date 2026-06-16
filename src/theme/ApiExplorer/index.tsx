import React, {useState, useEffect, type ReactNode} from 'react';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import CodeSnippets from '@theme/ApiExplorer/CodeSnippets';
import Request from '@theme/ApiExplorer/Request';
import Response from '@theme/ApiExplorer/Response';
import * as sdk from 'postman-collection';
import TryItModal from '@site/src/components/TryItModal';

import styles from './styles.module.css';

// Swizzled from docusaurus-theme-openapi-docs. The right column shows only the
// example request (cURL) and the example/live responses. The interactive
// Request form moves into a "Try it" modal, opened by a button next to the
// method+path (rendered in MethodEndpoint, left column) via a window event.
// The modal renders inline under this same Redux Provider, so Send still
// updates the responses shown here and in the modal.
export default function ApiExplorer({
  item,
  infoPath,
}: {
  item: any;
  infoPath: string;
}): ReactNode {
  const metadata = useDoc();
  const {mask_credentials} = metadata.frontMatter as {mask_credentials?: boolean};
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('kiss:tryit', handler);
    return () => window.removeEventListener('kiss:tryit', handler);
  }, []);

  const isEvent = item.method === 'event';
  const postman = new sdk.Request(
    item.postman
      ? sdk.Request.isRequest(item.postman)
        ? item.postman.toJSON()
        : item.postman
      : {},
  );

  const renderPreview = () => (
    <>
      {!isEvent && (
        <CodeSnippets
          postman={postman}
          codeSamples={item['x-codeSamples'] ?? []}
          maskCredentials={mask_credentials}
        />
      )}
      <Response item={item} />
    </>
  );

  return (
    <>
      {renderPreview()}
      {!isEvent && open && (
        <TryItModal item={item} onClose={() => setOpen(false)}>
          <div className={styles.modalCols}>
            <div className={styles.modalForm}>
              <Request item={item} />
            </div>
            <div className={styles.modalPreview}>{renderPreview()}</div>
          </div>
        </TryItModal>
      )}
    </>
  );
}
