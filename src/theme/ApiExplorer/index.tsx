import React, {useState, useEffect, type ReactNode} from 'react';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import CodeSnippets from '@theme/ApiExplorer/CodeSnippets';
import Request from '@theme/ApiExplorer/Request';
import Response from '@theme/ApiExplorer/Response';
import * as sdk from 'postman-collection';
import TryItModal from '@site/src/components/TryItModal';

import styles from './styles.module.css';

// Swizzled from docusaurus-theme-openapi-docs. The right column is reference
// only: the example request (cURL) on top, and the example responses below —
// the body's <StatusCodes> portals into #kiss-response-slot (see the StatusCodes
// swizzle). No interactive controls live here. The interactive Request form +
// live Response open in a "Try it" modal, triggered by a button next to the
// method+path (MethodEndpoint, left column) via a window event. The modal
// renders inline under this same Redux Provider so Send still works.
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

  const renderCURL = () =>
    isEvent ? null : (
      <div className={styles.curlBox}>
        <div className={styles.curlHeader}>cURL</div>
        <CodeSnippets
          postman={postman}
          codeSamples={item['x-codeSamples'] ?? []}
          maskCredentials={mask_credentials}
        />
      </div>
    );

  return (
    <>
      {renderCURL()}
      {/* Example responses: the body's <StatusCodes> portals into this slot. */}
      <div id="kiss-response-slot" />
      {!isEvent && open && (
        <TryItModal item={item} onClose={() => setOpen(false)}>
          <div className={styles.modalCols}>
            <div className={styles.modalForm}>
              <Request item={item} />
            </div>
            <div className={styles.modalPreview}>
              {renderCURL()}
              <Response item={item} />
            </div>
          </div>
        </TryItModal>
      )}
    </>
  );
}
