import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useHistory, useLocation} from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';

import manifest from '../../hardware-viewers.json';
import styles from './InteractiveHardwareViewer.module.css';

type DeepLinkStatus = 'idle' | 'selected' | 'not-found' | 'error';

export default function InteractiveDiagram(): React.ReactNode {
  const location = useLocation();
  const history = useHistory();
  const [search, setSearch] = useState(location.search);
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const requestedRevision = params.get('revision') || manifest.defaultRevision;
  const requestedRef = params.get('ref')?.trim() || '';
  const revision = manifest.revisions.find((item) => item.id === requestedRevision);
  const [status, setStatus] = useState<DeepLinkStatus>('idle');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => setSearch(window.location.search), [location.search]);

  const assetPath = revision
    ? `/internals/kicanvas/${revision.diagram.destination}/`
    : '/internals/kicanvas/invalid/';
  const assetUrl = useBaseUrl(assetPath);
  const iframeUrl = requestedRef ? `${assetUrl}?ref=${encodeURIComponent(requestedRef)}` : assetUrl;
  const generatedRoot = useBaseUrl('/internals/kicanvas/');
  const bootstrapScript = `(() => {
    const root = document.querySelector('[data-drpd-kicanvas-root]');
    if (!root) return;
    const params = new URLSearchParams(window.location.search);
    const revisionId = params.get('revision') || ${JSON.stringify(manifest.defaultRevision)};
    const ref = (params.get('ref') || '').trim();
    const revisions = ${JSON.stringify(manifest.revisions)};
    const revision = revisions.find((item) => item.id === revisionId);
    const iframe = root.querySelector('iframe');
    const link = root.querySelector('[data-drpd-kicanvas-open]');
    const select = root.querySelector('select');
    const error = root.querySelector('[data-drpd-kicanvas-bootstrap-error]');
    const warning = root.querySelector('[data-drpd-kicanvas-bootstrap-warning]');

    if (!revision) {
      error.textContent = 'Interactive diagram revision ' + revisionId + ' is not published.';
      error.hidden = false;
      iframe.hidden = true;
      link.hidden = true;
      select.disabled = true;
      return;
    }

    select.value = revision.id;
    const url = ${JSON.stringify(generatedRoot)} + revision.diagram.destination + '/' +
      (ref ? '?ref=' + encodeURIComponent(ref) : '');
    iframe.src = url;
    iframe.title = 'Dr. PD ' + revision.label + ' interactive diagram';
    link.href = url;
    link.textContent = 'Open full-page ' + revision.label + ' diagram';

    select.addEventListener('change', () => {
      const next = new URLSearchParams(window.location.search);
      next.set('revision', select.value);
      window.location.search = next.toString();
    });

    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'drpd:kicanvas-deep-link' || event.data.ref !== ref) return;
      if (event.data.status === 'not-found') {
        warning.textContent = 'Component ' + ref + ' was not found in ' + revision.label + '.';
        warning.hidden = false;
      } else if (event.data.status === 'error') {
        error.textContent = 'Could not select component ' + ref + ' in ' + revision.label + '.';
        error.hidden = false;
      }
    });
  })();`;

  useEffect(() => setStatus('idle'), [requestedRevision, requestedRef]);
  useEffect(() => {
    const receiveStatus = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'drpd:kicanvas-deep-link') return;
      if (event.data.ref !== requestedRef) return;
      if (['selected', 'not-found', 'error'].includes(event.data.status)) setStatus(event.data.status);
    };
    window.addEventListener('message', receiveStatus);
    return () => window.removeEventListener('message', receiveStatus);
  }, [requestedRef]);

  const selectRevision = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = new URLSearchParams(location.search);
    next.set('revision', event.target.value);
    history.push({...location, search: `?${next.toString()}`});
  };

  if (!revision) {
    return <div className="alert alert--danger" role="alert">Interactive diagram revision <code>{requestedRevision}</code> is not published.</div>;
  }

  return (
    <div className={styles.viewer} data-drpd-kicanvas-root="v1">
      <div className="alert alert--danger" role="alert" data-drpd-kicanvas-bootstrap-error hidden />
      <div className="alert alert--warning" role="alert" data-drpd-kicanvas-bootstrap-warning hidden />
      <div className={styles.toolbar}>
        <label>
          Board revision:{' '}
          <select value={revision.id} onChange={selectRevision} aria-label="Board revision">
            {manifest.revisions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <div className={styles.actions}>
          <button className="button button--primary" type="button" onClick={() => iframeRef.current?.requestFullscreen()}>
            Expand diagram
          </button>
          <a className="button button--secondary" href={iframeUrl} target="_blank" rel="noreferrer" data-drpd-kicanvas-open>
            Open full-page {revision.label} diagram
          </a>
        </div>
      </div>

      {requestedRef && status === 'not-found' && (
        <div className="alert alert--warning" role="alert">Component <code>{requestedRef}</code> was not found in {revision.label}.</div>
      )}
      {requestedRef && status === 'error' && (
        <div className="alert alert--danger" role="alert">Could not select component <code>{requestedRef}</code> in {revision.label}.</div>
      )}

      <iframe ref={iframeRef} key={iframeUrl} className={styles.frame} src={iframeUrl}
        title={`Dr. PD ${revision.label} interactive diagram`} loading="lazy" allowFullScreen />
      <script dangerouslySetInnerHTML={{__html: bootstrapScript}} />
    </div>
  );
}
