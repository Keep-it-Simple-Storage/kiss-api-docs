import React, {useState, type ReactNode} from 'react';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import CodeSnippets from '@theme/ApiExplorer/CodeSnippets';
import Request from '@theme/ApiExplorer/Request';
import Response from '@theme/ApiExplorer/Response';
import SecuritySchemes from '@theme/ApiExplorer/SecuritySchemes';
import * as sdk from 'postman-collection';
import TryItModal from '@site/src/components/TryItModal';

import styles from './styles.module.css';

// Swizzled from docusaurus-theme-openapi-docs: the right column shows only the
// example request (cURL) and the example/live responses. The interactive
// Request form (auth, params, body, Send) moves into a "Try it" modal. The
// modal renders inline under this same Provider, so Send still updates the
// response here.
export default function ApiExplorer({
  item,
  infoPath,
}: {
  item: any;
  infoPath: string;
}): ReactNode {
  const metadata = useDoc();
  const {mask_credentials} = metadata.frontMatter as {mask_credentials?: boolean};
  const [tryItOpen, setTryItOpen] = useState(false);

  const postman = new sdk.Request(
    item.postman
      ? sdk.Request.isRequest(item.postman)
        ? item.postman.toJSON()
        : item.postman
      : {},
  );

  const isEvent = item.method === 'event';

  return (
    <>
      <SecuritySchemes infoPath={infoPath} />
      {!isEvent && (
        <CodeSnippets
          postman={postman}
          codeSamples={item['x-codeSamples'] ?? []}
          maskCredentials={mask_credentials}
        />
      )}
      {!isEvent && (
        <button type="button" className={styles.tryItButton} onClick={() => setTryItOpen(true)}>
          Try it
        </button>
      )}
      <Response item={item} />
      {!isEvent && tryItOpen && (
        <TryItModal title={item.summary ? `Try it: ${item.summary}` : 'Try it'} onClose={() => setTryItOpen(false)}>
          <Request item={item} />
          <Response item={item} />
        </TryItModal>
      )}
    </>
  );
}
