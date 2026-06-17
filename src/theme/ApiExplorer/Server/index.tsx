import React, {type ReactNode} from 'react';
import {useTypedSelector} from '@theme/ApiItem/hooks';
import {API_BASE_URL} from '@site/src/lib/apiBase';

// Swizzled to render the server URL read-only. The stock component offers an
// "Edit / Hide" toggle for editing server variables; our API has a single
// fixed base URL with no variables, so that control is just noise.
export default function Server(): ReactNode {
  const value = useTypedSelector((state: any) => state.server.value);

  let url = '';
  if (value?.variables) {
    url = value.url.replace(/\/$/, '');
    Object.keys(value.variables).forEach((v) => {
      url = url.replace(`{${v}}`, value.variables?.[v]?.default ?? '');
    });
  } else if (value?.url) {
    url = value.url.replace(/\/$/, '');
  }

  // Static reference pages may not have a server value in the store; fall
  // back to the fixed base URL so the base is always shown.
  const finalUrl = url || API_BASE_URL;

  return (
    <span className="openapi-explorer__server-url" title={finalUrl}>
      {finalUrl}
    </span>
  );
}
