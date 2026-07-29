const VIEWER_PATHS = {
  bom: 'internals/interactive-bom/',
  diagram: 'internals/interactive-diagram/',
};

export function buildHardwareViewerUrl(
  baseUrl,
  viewer,
  revision,
  reference,
) {
  const root = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const query = new URLSearchParams({revision, ref: reference});
  return `${root}${VIEWER_PATHS[viewer]}?${query.toString()}`;
}

export function buildHardwareViewerLink(baseUrl, viewer, revision, reference) {
  const label = viewer === 'bom' ? 'interactive BOM' : 'interactive schematic';
  return {
    href: buildHardwareViewerUrl(baseUrl, viewer, revision, reference),
    target: 'drpd-hardware-viewer',
    ariaLabel: `Open ${reference} in the ${revision} ${label}`,
  };
}
