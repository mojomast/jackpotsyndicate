/** @jsxRuntime automatic */
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { startGameLoop } from './store/gameStore';
import { installTestApi, isTestMode } from './testApi';
import './theme/tokens.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element');
}

createRoot(rootElement).render(<App />);

const testApiEnabled = isTestMode() || import.meta.env.VITE_ENABLE_TEST_API === 'true';

if (testApiEnabled) {
  installTestApi();
} else {
  startGameLoop();
}
