import './global.css';
import './setup';

import { createRoot } from 'react-dom/client';

import { App } from './app';

// This administration build uses Simplified Chinese display strings.
document.documentElement.lang = 'zh-Hans';

// oxlint-disable-next-line typescript/no-non-null-assertion
createRoot(document.getElementById('app')!).render(<App />);
