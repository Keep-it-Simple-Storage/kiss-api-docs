import React, {useState, useEffect, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import ApiTabs from '@theme/ApiTabs';
import TabItem from '@theme/TabItem';
import ApiCodeBlock from '@theme/ApiExplorer/ApiCodeBlock';
import {sampleResponseFromSchema} from 'docusaurus-plugin-openapi-docs/lib/openapi/createResponseExample';

// The body MDX renders <StatusCodes {...require("./….StatusCodes.json")}/>, so
// this is the only place with the per-endpoint response data. We render a
// minimal, reference-only view — status-code tabs (200/4xx) + the example
// response JSON, just the shape — and portal it into the right-column slot that
// ApiExplorer renders (no schema trees, mime tabs, or field blocks). React
// portals preserve context, so the tabs keep working. ApiExplorer is wrapped in
// BrowserOnly, so its slot mounts a tick late: retry until it exists, with an
// inline fallback if it never appears.

function ResponseShapes({responses}: {responses?: Record<string, any>}): ReactNode {
  const codes = Object.keys(responses ?? {});
  if (codes.length === 0) return null;
  return (
    <ApiTabs>
      {codes.map((code) => {
        const schema = responses?.[code]?.content?.['application/json']?.schema;
        let body = '(no response body)';
        if (schema) {
          try {
            const sample = sampleResponseFromSchema(schema);
            body =
              typeof sample === 'object'
                ? JSON.stringify(sample, null, 2)
                : String(sample);
          } catch {
            body = '(example unavailable)';
          }
        }
        return (
          <TabItem key={code} label={code} value={code}>
            <ApiCodeBlock language="json" showLineNumbers={false}>
              {body}
            </ApiCodeBlock>
          </TabItem>
        );
      })}
    </ApiTabs>
  );
}

export default function StatusCodes(props: any): ReactNode {
  const [mounted, setMounted] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    setMounted(true);
    let raf = 0;
    let tries = 0;
    const find = () => {
      const el = document.getElementById('kiss-response-slot');
      if (el) {
        setTarget(el);
      } else if (tries++ < 60) {
        raf = requestAnimationFrame(find);
      } else {
        setGaveUp(true);
      }
    };
    find();
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  if (!mounted) return null;
  const content = <ResponseShapes responses={props.responses} />;
  if (target) return createPortal(content, target);
  if (gaveUp) return content;
  return null;
}
