import React, {type ReactNode} from 'react';
import {useTypedSelector} from '@theme/ApiItem/hooks';

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

  if (!url) {
    return null;
  }

  return (
    <span className="openapi-explorer__server-url" title={url}>
      {url}
    </span>
  );
}
