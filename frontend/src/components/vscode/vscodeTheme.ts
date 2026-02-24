import { useColorModeValue } from '@chakra-ui/react';

/**
 * VS Code-inspired design tokens used across the Studio layout.
 *
 * `VS.size`        — static pixel sizes (unchanged)
 * `useVSColors()`  — reactive color palette; adapts to Chakra light / dark mode
 */
export const VS = {
  size: {
    activityBar: 48,
    sidebar:     260,
    chat:        320,
    titleBar:    35,
    tabBar:      35,
    statusBar:   22,
  },
} as const;

/**
 * Returns the full Studio color palette keyed to the current Chakra color mode.
 * Call this hook once at the top of each Studio component.
 */
export function useVSColors() {
  return {
    // Chrome
    titleBar:           useColorModeValue('#EDF2F7', '#3c3c3c'),
    activityBar:        useColorModeValue('#E2E8F0', '#333333'),
    activityBarBorder:  useColorModeValue('#CBD5E0', '#2c2c2c'),

    // Panels
    sidebar:            useColorModeValue('#F7FAFC', '#252526'),
    sidebarBorder:      useColorModeValue('#E2E8F0', '#3c3c3c'),
    editor:             useColorModeValue('#FFFFFF',  '#1e1e1e'),
    tabBar:             useColorModeValue('#EDF2F7', '#2d2d2d'),
    tabActive:          useColorModeValue('#FFFFFF',  '#1e1e1e'),
    tabInactive:        useColorModeValue('#EDF2F7', '#2d2d2d'),
    tabActiveBorder:    useColorModeValue('#3182CE', '#007acc'),
    panel:              useColorModeValue('#F7FAFC', '#252526'),
    panelBorder:        useColorModeValue('#E2E8F0', '#3c3c3c'),

    // Status bar
    statusBar:          useColorModeValue('#3182CE', '#007acc'),
    statusBarFg:        '#ffffff',

    // Foreground
    fg:                 useColorModeValue('#2D3748', '#cccccc'),
    fgMuted:            useColorModeValue('#718096', '#969696'),
    fgActive:           useColorModeValue('#1A202C', '#ffffff'),
    activityIcon:       useColorModeValue('#718096', '#858585'),
    activityIconActive: useColorModeValue('#1A202C', '#ffffff'),
    activityIndicator:  useColorModeValue('#3182CE', '#007acc'),

    // Interactive
    hover:              useColorModeValue('rgba(0,0,0,0.05)',      'rgba(255,255,255,0.07)'),
    selected:           useColorModeValue('#BEE3F8', '#094771'),
    selectedHover:      useColorModeValue('#90CDF4', '#1a7dc5'),

    // Inputs
    input:              useColorModeValue('#EDF2F7', '#3c3c3c'),
    inputBorder:        useColorModeValue('#CBD5E0', '#555555'),

    // Misc
    badge:              useColorModeValue('#3182CE', '#007acc'),
    scrollbar:          useColorModeValue('rgba(100,100,100,0.3)', 'rgba(121,121,121,0.4)'),
    scrollbarHover:     useColorModeValue('rgba(80,80,80,0.5)',    'rgba(100,100,100,0.7)'),
    sectionHeader:      useColorModeValue('#EDF2F7', '#3c3c3c'),
  };
}
