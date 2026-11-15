/**
 * Build/run flags for the shell. `import.meta.env` is statically replaced by
 * Vite (and the sandbox esbuild stand-in); under plain Node (unit tests via
 * tsx) it is undefined, which we treat as a development build.
 */
export function isDevBuild(): boolean {
  try {
    return import.meta.env.DEV === true;
  } catch {
    return true;
  }
}

function queryFlag(name: string, search?: string): boolean {
  if (search === undefined && typeof window === 'undefined') return false;
  const query = search ?? window.location.search;
  return new URLSearchParams(query).get(name) === '1';
}

/**
 * Dev affordances (the screen-jump nav, unconstrained hash routes) exist only
 * in development builds opened with `?dev=1` or `?test=1`. The shipped game
 * always follows the phase machine.
 */
export function devToolsEnabled(search?: string): boolean {
  return isDevBuild() && (queryFlag('dev', search) || queryFlag('test', search));
}

/** `?test=1`: the C-8 test surface (hidden test-id registry, test bridge). */
export function testQuery(search?: string): boolean {
  return queryFlag('test', search);
}
