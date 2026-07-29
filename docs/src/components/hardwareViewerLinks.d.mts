export type HardwareViewerKind = 'bom' | 'diagram';

export function buildHardwareViewerUrl(
  baseUrl: string,
  viewer: HardwareViewerKind,
  revision: string,
  reference: string,
): string;

export function buildHardwareViewerLink(
  baseUrl: string,
  viewer: HardwareViewerKind,
  revision: string,
  reference: string,
): {
  href: string;
  target: '_blank';
  rel: 'noopener noreferrer';
  ariaLabel: string;
};
