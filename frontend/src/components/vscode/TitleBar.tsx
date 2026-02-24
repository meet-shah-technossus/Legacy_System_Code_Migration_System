import { Box, Flex, HStack, Icon, IconButton, Text, Tooltip, useColorMode } from '@chakra-ui/react';
import { FiMoon, FiSun } from 'react-icons/fi';
import { VS, useVSColors } from './vscodeTheme';

interface TitleBarProps {
  /** Optional right-side breadcrumb segment (e.g. currently open job name) */
  subtitle?: string;
}

/**
 * macOS-style VS Code title bar.
 * Shows traffic-light dots on the left, an app title / breadcrumb in the centre,
 * and a light / dark mode toggle on the right.
 */
export default function TitleBar({ subtitle }: TitleBarProps) {
  const colors = useVSColors();
  const { colorMode, toggleColorMode } = useColorMode();

  return (
    <Flex
      h={`${VS.size.titleBar}px`}
      bg={colors.titleBar}
      align="center"
      justify="space-between"
      px={3}
      flexShrink={0}
      userSelect="none"
      borderBottom={`1px solid ${colors.activityBarBorder}`}
    >
      {/* macOS traffic lights */}
      <HStack spacing="6px">
        <Box
          w="12px" h="12px" borderRadius="full"
          bg="#ff5f57"
          cursor="pointer"
          title="Close"
          _hover={{ filter: 'brightness(0.85)' }}
        />
        <Box
          w="12px" h="12px" borderRadius="full"
          bg="#febc2e"
          cursor="pointer"
          title="Minimise"
          _hover={{ filter: 'brightness(0.85)' }}
        />
        <Box
          w="12px" h="12px" borderRadius="full"
          bg="#28c840"
          cursor="pointer"
          title="Maximise"
          _hover={{ filter: 'brightness(0.85)' }}
        />
      </HStack>

      {/* Centre breadcrumb */}
      <HStack spacing="6px">
        <Text fontSize="12px" color={colors.fgMuted} fontWeight="medium">
          Legacy Migration Studio
        </Text>
        {subtitle && (
          <>
            <Text fontSize="12px" color={colors.fgMuted}>›</Text>
            <Text fontSize="12px" color={colors.fg}>{subtitle}</Text>
          </>
        )}
      </HStack>

      {/* Right — dark/light mode toggle */}
      <Tooltip label={colorMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'} placement="bottom" hasArrow>
        <IconButton
          aria-label="Toggle color mode"
          icon={<Icon as={colorMode === 'dark' ? FiSun : FiMoon} />}
          size="xs"
          variant="ghost"
          color={colors.fgMuted}
          _hover={{ color: colors.fgActive, bg: colors.hover }}
          onClick={toggleColorMode}
        />
      </Tooltip>
    </Flex>
  );
}
