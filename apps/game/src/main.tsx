/** @jsxRuntime automatic */
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { startGameLoop } from './store/gameStore';
import { installTestApi, isTestMode } from './testApi';
import { preloadSpriteAssets, type SpriteManifest } from './store/spriteResolver';
import { installUiArtVariables, preloadUiChrome } from './components/Artwork';
import assetManifest from '../public/atlas/asset-manifest.json';
import './theme/tokens.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element');
}

// Install the inlined 9-slice variables synchronously, then paint the shell
// before decoding the full atlas. Waiting for all 67 art frames first left the
// game blank for seconds on slower machines; individual images now populate as
// they decode while the shell, HUD and controls are immediately interactive.
installUiArtVariables();

const root = createRoot(rootElement);
root.render(<App />);

// The test bridge is a development/E2E affordance. A query string alone must
// never enable privileged store mutation on a production deployment.
const testApiEnabled =
  import.meta.env.DEV &&
  (isTestMode() || import.meta.env.VITE_ENABLE_TEST_API === 'true');

if (testApiEnabled) {
  installTestApi();
} else {
  startGameLoop();
}

void Promise.all([
  preloadSpriteAssets(assetManifest as SpriteManifest),
  preloadUiChrome(),
]).catch((error: unknown) => {
  console.warn('Art preload did not finish; the playable shell is still available.', error);
});
