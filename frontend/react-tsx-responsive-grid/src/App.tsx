import React from 'react';
import ResponsiveGrid, { Widget } from './components/ResponsiveGrid';

const widgets: Widget[] = [
  { top: 10, left: 10, width: 400, height: 300, title: 'Widget 1', content: 'Some text 1' },
  { top: 10, left: 500, width: 900, height: 300, title: 'Widget 2', content: 'Some text 2' },
  { top: 10, left: 1500, width: 350, height: 1000, title: 'Widget 2', content: 'Some text 2' },
  { top: 400, left: 10, width: 400, height: 300, title: 'Widget 3', content: 'Some text 3' },
  { top: 400, left: 10, width: 400, height: 300, title: 'Widget 3', content: 'Some text 3' },
  { top: 400, left: 500, width: 400, height: 600, title: 'Widget 4', content: 'Some text 4' },
  { top: 400, left: 1000, width: 400, height: 600, title: 'Widget 4', content: 'Some text 4' },
  { top: 800, left: 10, width: 400, height: 200, title: 'Widget 4', content: 'Some text 4' },
];

const App: React.FC = () => {
  return <ResponsiveGrid widgets={widgets} />;
};

export default App;