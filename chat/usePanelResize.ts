import React, { useState, useRef } from 'react';

export function usePanelResize() {
  const [dimensions, setDimensions] = useState({ width: 400, height: 500 });
  const [position, setPosition] = useState({ right: 24, bottom: 96 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (
      e.target === e.currentTarget ||
      (e.target as HTMLElement).closest('.drag-handle')
    ) {
      setIsDragging(true);
      const startX = e.clientX;
      const startY = e.clientY;
      const startRight = position.right;
      const startBottom = position.bottom;

      // Disable pointer events on iframe during drag
      const iframe = document.querySelector('iframe');
      if (iframe) {
        iframe.style.pointerEvents = 'none';
      }

      const handleMouseMove = (e: MouseEvent) => {
        setPosition({
          right: startRight - (e.clientX - startX),
          bottom: startBottom - (e.clientY - startY),
        });
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        // Re-enable pointer events on iframe
        if (iframe) {
          iframe.style.pointerEvents = 'auto';
        }
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = dimensions.width;
    const startHeight = dimensions.height;

    // Disable pointer events on iframe during resize
    const iframe = document.querySelector('iframe');
    if (iframe) {
      iframe.style.pointerEvents = 'none';
    }

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(350, startWidth - (e.clientX - startX));
      const newHeight = Math.max(400, startHeight - (e.clientY - startY));
      setDimensions({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // Re-enable pointer events on iframe
      if (iframe) {
        iframe.style.pointerEvents = 'auto';
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const panelStyle = {
    width: `${dimensions.width}px`,
    height: `${dimensions.height}px`,
    right: `${position.right}px`,
    bottom: `${position.bottom}px`,
  };

  return {
    dimensions,
    position,
    isDragging,
    isResizing,
    panelRef,
    panelStyle,
    handleMouseDown,
    handleResizeMouseDown,
  };
}
