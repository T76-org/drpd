import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';

import manifest from '../../hardware-viewers.json';
import {buildHardwareViewerLink} from './hardwareViewerLinks.mjs';
import styles from './ComponentRef.module.css';

type Props = {
  revision: string;
  reference: string;
  label?: string;
};

export default function ComponentRef({revision, reference, label}: Props): React.ReactNode {
  if (!manifest.revisions.some((item) => item.id === revision)) {
    throw new Error(`Hardware viewer revision ${revision} is not published.`);
  }

  const normalizedReference = reference.trim();
  if (!normalizedReference) {
    throw new Error('ComponentRef requires a non-empty reference.');
  }

  const baseUrl = useBaseUrl('/');
  const bom = buildHardwareViewerLink(baseUrl, 'bom', revision, normalizedReference);
  const diagram = buildHardwareViewerLink(baseUrl, 'diagram', revision, normalizedReference);

  return (
    <span className={styles.componentRef} data-component-reference={normalizedReference}>
      <a
        className={styles.referenceLink}
        href={diagram.href}
        target={diagram.target}
        aria-label={diagram.ariaLabel}
      >
        <code className={styles.reference}>{label || normalizedReference}</code>
      </a>
      <span className={styles.choices}>
        <a
          className={styles.link}
          href={bom.href}
          target={bom.target}
          aria-label={bom.ariaLabel}
        >
          BOM
        </a>
        <a
          className={styles.link}
          href={diagram.href}
          target={diagram.target}
          aria-label={diagram.ariaLabel}
        >
          Schematic
        </a>
      </span>
    </span>
  );
}
