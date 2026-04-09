import React, { useEffect, useRef, useState, CSSProperties } from 'react';

export interface Widget {
  top: number;
  left: number;
  width: number;
  height: number;
  title: string;
  content: string;
}

interface ResponsiveGridProps {
  widgets: Widget[];
}

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;

const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({ widgets }) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const scaleCanvas = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const newScale = Math.min(vw / DESIGN_WIDTH, vh / DESIGN_HEIGHT);
    setScale(newScale);

    if (canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.style.left = `${(vw - DESIGN_WIDTH * newScale) / 2}px`;
      canvas.style.top = `${(vh - DESIGN_HEIGHT * newScale) / 2}px`;
    }
  };

  useEffect(() => {
    scaleCanvas();
    window.addEventListener('resize', scaleCanvas);
    return () => window.removeEventListener('resize', scaleCanvas);
  }, []);

  const canvasStyle: CSSProperties = {
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    position: 'absolute',
    transformOrigin: 'top left',
    transform: `scale(${scale})`,
  };

  return (
    <div
      id="responsive-grid"
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div id="canvas" ref={canvasRef} style={canvasStyle}>
        {widgets.map((w, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: w.top,
              left: w.left,
              width: w.width,
              height: w.height,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              border: '1px solid #444',
              borderRadius: 8,
              background: '#f0f0f0',
              padding: 10,
            }}
          >
            <div className="widget-header">
              <h2
                style={{
                  fontSize: 'clamp(0.75rem, 25cqw, 4rem)',
                  margin: 0,
                  fontWeight: 'bold',
                  lineHeight: 1.1,
                }}
              >
                {w.title}
              </h2>
            </div>
            <div className="widget-content">
              <p
                style={{
                  fontSize: 'clamp(1rem, 10cqw, 2rem)',
                  marginTop: '0.5em',
                  lineHeight: 1.3,
                }}
              >
                {w.content}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ResponsiveGrid;