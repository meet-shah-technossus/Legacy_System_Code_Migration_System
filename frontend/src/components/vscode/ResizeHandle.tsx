import { Box } from '@chakra-ui/react';
import { useVSColors } from './vscodeTheme';

interface ResizeHandleProps {
  /** 'horizontal' = dragging left/right (between column panels) */
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
}

/**
 * Invisible hit-area that becomes a resize cursor and highlights on hover.
 * Attaches global mousemove/mouseup listeners during drag so the pointer can
 * leave the element without interrupting the drag.
 */
export default function ResizeHandle({ direction, onResize }: ResizeHandleProps) {
  const colors = useVSColors();
  const isCol = direction === 'horizontal';

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    // Track the *last* pointer position so we emit incremental deltas each
    // mousemove frame rather than the cumulative offset from drag-start.
    let prevPos = isCol ? e.clientX : e.clientY;

    const onMove = (ev: MouseEvent) => {
      ev.preventDefault();
      const cur = isCol ? ev.clientX : ev.clientY;
      const delta = cur - prevPos;
      prevPos = cur;
      if (delta !== 0) onResize(delta);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <Box
      w={isCol ? '4px' : '100%'}
      h={isCol ? '100%' : '4px'}
      flexShrink={0}
      cursor={isCol ? 'col-resize' : 'row-resize'}
      bg="transparent"
      zIndex={20}
      _hover={{ bg: colors.activityIndicator, opacity: 0.6 }}
      transition="background 0.15s"
      onMouseDown={handleMouseDown}
    />
  );
}
