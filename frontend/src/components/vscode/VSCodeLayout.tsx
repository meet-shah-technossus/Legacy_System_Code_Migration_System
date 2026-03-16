import { Box, Flex } from '@chakra-ui/react';
import { useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import TitleBar from './TitleBar';
import ActivityBar from './ActivityBar';
import type { ActivityBarTab } from './ActivityBar';
import StatusBar from './StatusBar';
import ResizeHandle from './ResizeHandle';
import { VS, useVSColors } from './vscodeTheme';

export interface VSCodeLayoutProps {
  /**
   * Optional breadcrumb segment shown in the title bar centre
   * (e.g. the name of the currently open job).
   */
  titleSubtitle?: string;

  /**
   * Content rendered inside the Explorer / sidebar column.
   * Receives the active activity tab so it can switch views.
   */
  explorer?: (activeTab: ActivityBarTab | null) => ReactNode;

  /** Content rendered inside the main editor area (centre column). */
  editor?: ReactNode;

  /** Content rendered inside the right chat / AI panel. */
  chat?: ReactNode;

  /** Activity bar tabs to hide (e.g. ['queue'] for Direct Studio) */
  excludeTabs?: ActivityBarTab[];
}

const MIN_SIDEBAR = 160;
const MAX_SIDEBAR = 520;
const MIN_CHAT    = 220;
const MAX_CHAT    = 600;

/**
 * Full-screen VS Code–style 3-panel layout.
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  Title Bar                                              │
 * ├─┬───────────────┬──────────────────────┬───────────────┤
 * │A│  Explorer /   │   Editor Area        │  Chat / AI    │
 * │B│  Sidebar      │   (centre, flex)     │  Panel        │
 * │  │  (resizable) │                      │  (resizable)  │
 * ├─┴───────────────┴──────────────────────┴───────────────┤
 * │  Status Bar                                             │
 * └─────────────────────────────────────────────────────────┘
 *
 * • Clicking the active Activity Bar tab collapses / expands the sidebar.
 * • Panels are draggable-resizable via ResizeHandle.
 * • Default widths come from VS.size.*
 */
export default function VSCodeLayout({
  titleSubtitle,
  explorer,
  editor,
  chat,
  excludeTabs = [],
}: VSCodeLayoutProps) {
  const colors = useVSColors();
  /* ── panel widths ─────────────────────────────────────── */
  const [sidebarWidth, setSidebarWidth] = useState<number>(VS.size.sidebar);
  const [chatWidth,    setChatWidth]    = useState<number>(VS.size.chat);

  /* ── visibility / active tab ─────────────────────────── */
  const [activeTab,        setActiveTab]        = useState<ActivityBarTab | null>('explorer');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatCollapsed,    setChatCollapsed]    = useState(false);   // reserved for Phase 3.4

  /* ── activity-bar handler ────────────────────────────── */
  const handleTabChange = useCallback(
    (tab: ActivityBarTab) => {
      if (tab === 'settings') {
        // Only settings navigates away — handled externally; skip for now
        return;
      }
      if (tab === activeTab) {
        // Toggle sidebar collapse
        setSidebarCollapsed((c) => !c);
      } else {
        setActiveTab(tab);
        setSidebarCollapsed(false);
      }
    },
    [activeTab],
  );

  /* ── resize callbacks ────────────────────────────────── */
  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((w) => Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, w + delta)));
  }, []);

  const handleChatResize = useCallback((delta: number) => {
    // Drag rightward = shrink chat; drag leftward = grow chat
    setChatWidth((w) => Math.max(MIN_CHAT, Math.min(MAX_CHAT, w - delta)));
  }, []);

  const showSidebar = !sidebarCollapsed && activeTab !== null;
  const showChat    = !chatCollapsed;

  return (
    <Flex
      direction="column"
      h="100%"
      w="100%"
      overflow="hidden"
      bg={colors.editor}
      fontFamily="'Inter', -apple-system, sans-serif"
    >
      {/* ── Title Bar ──────────────────────────────────── */}
      <TitleBar subtitle={titleSubtitle} />

      {/* ── Main Content Row ───────────────────────────── */}
      <Flex flex={1} overflow="hidden" minH={0}>

        {/* Activity Bar */}
        <ActivityBar activeTab={activeTab} onTabChange={handleTabChange} excludeTabs={excludeTabs} />

        {/* Explorer / Sidebar */}
        {showSidebar && (
          <>
            <Box
              w={`${sidebarWidth}px`}
              minW={`${sidebarWidth}px`}
              maxW={`${sidebarWidth}px`}
              h="100%"
              bg={colors.sidebar}
              borderRight={`1px solid ${colors.sidebarBorder}`}
              overflow="hidden"
              display="flex"
              flexDirection="column"
              flexShrink={0}
            >
              {explorer?.(activeTab)}
            </Box>
            <ResizeHandle direction="horizontal" onResize={handleSidebarResize} />
          </>
        )}

        {/* Editor Area */}
        <Box
          flex={1}
          h="100%"
          bg={colors.editor}
          overflow="hidden"
          display="flex"
          flexDirection="column"
          minW={0}
        >
          {editor}
        </Box>

        {/* Chat / AI Panel */}
        {showChat && (
          <>
            <ResizeHandle direction="horizontal" onResize={handleChatResize} />
            <Box
              w={`${chatWidth}px`}
              minW={`${chatWidth}px`}
              maxW={`${chatWidth}px`}
              h="100%"
              bg={colors.panel}
              borderLeft={`1px solid ${colors.panelBorder}`}
              overflow="hidden"
              display="flex"
              flexDirection="column"
              flexShrink={0}
            >
              {chat}
            </Box>
          </>
        )}
      </Flex>

      {/* ── Status Bar ─────────────────────────────────── */}
      <StatusBar />
    </Flex>
  );
}
