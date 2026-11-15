/** @jsxRuntime automatic */
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { startGameLoop } from './store/gameStore';
import { installTestApi, isTestMode } from './testApi';
import { preloadSpriteAssets, type SpriteManifest } from './store/spriteResolver';
import { installUiArtVariables } from './components/Artwork';
import assetManifest from '../public/atlas/asset-manifest.json';
import './theme/tokens.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element');
}

// Warm every committed sprite once at boot so later screen changes never turn
// into late runtime network requests (the NET e2e assertion depends on this).
await preloadSpriteAssets(assetManifest as SpriteManifest);
installUiArtVariables();

createRoot(rootElement).render(<App />);

const testApiEnabled = isTestMode() || import.meta.env.VITE_ENABLE_TEST_API === 'true';

if (testApiEnabled) {
  installTestApi();
} else {
  startGameLoop();
}
