import { Box, Flex, Icon, Tooltip, VStack } from '@chakra-ui/react';
import type { ComponentType } from 'react';
import {
  FiFolder,
  FiSearch,
  FiZap,
  FiSettings,
} from 'react-icons/fi';
import { VS, useVSColors } from './vscodeTheme';

export type ActivityBarTab = 'explorer' | 'search' | 'queue' | 'settings';

interface ActivityItem {
  id: ActivityBarTab;
  icon: ComponentType;
  label: string;
}

const TOP_ITEMS: ActivityItem[] = [
  { id: 'explorer', icon: FiFolder,  label: 'Explorer'  },
  { id: 'search',   icon: FiSearch,  label: 'Search'    },
  { id: 'queue',    icon: FiZap,     label: 'Queue'     },
];

const BOTTOM_ITEMS: ActivityItem[] = [
  { id: 'settings', icon: FiSettings, label: 'Settings' },
];

interface ActivityBarProps {
  activeTab: ActivityBarTab | null;
  onTabChange: (tab: ActivityBarTab) => void;
}

/**
 * Thin vertical icon bar on the far left — mirrors VS Code's Activity Bar.
 * Clicking an active tab collapses the sidebar; clicking another tab switches it.
 */
export default function ActivityBar({ activeTab, onTabChange }: ActivityBarProps) {
  const colors = useVSColors();

  const renderItem = (item: ActivityItem) => {
    const isActive = activeTab === item.id;
    return (
      <Tooltip key={item.id} label={item.label} placement="right" hasArrow openDelay={400}>
        <Box
          position="relative"
          w={`${VS.size.activityBar}px`}
          h={`${VS.size.activityBar}px`}
          display="flex"
          alignItems="center"
          justifyContent="center"
          cursor="pointer"
          color={isActive ? colors.activityIconActive : colors.activityIcon}
          _hover={{ color: colors.fgActive }}
          onClick={() => onTabChange(item.id)}
          aria-label={item.label}
          role="button"
        >
          {/* Active indicator stripe */}
          {isActive && (
            <Box
              position="absolute"
              left={0}
              top="20%"
              h="60%"
              w="2px"
              bg={colors.activityIndicator}
              borderRadius="0 2px 2px 0"
            />
          )}
          <Icon as={item.icon as ComponentType} boxSize="20px" />
        </Box>
      </Tooltip>
    );
  };

  return (
    <Flex
      direction="column"
      w={`${VS.size.activityBar}px`}
      h="100%"
      bg={colors.activityBar}
      borderRight={`1px solid ${colors.activityBarBorder}`}
      justify="space-between"
      flexShrink={0}
    >
      <VStack spacing={0} align="stretch">
        {TOP_ITEMS.map(renderItem)}
      </VStack>
      <VStack spacing={0} align="stretch" mb={1}>
        {BOTTOM_ITEMS.map(renderItem)}
      </VStack>
    </Flex>
  );
}
