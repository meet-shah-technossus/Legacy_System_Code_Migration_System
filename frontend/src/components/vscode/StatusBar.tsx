import { Flex, HStack, Icon, Text } from '@chakra-ui/react';
import type { ComponentType } from 'react';
import { FiGitBranch, FiAlertCircle, FiCheckCircle, FiZap } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { VS, useVSColors } from './vscodeTheme';
import { useJobStatistics } from '../../hooks/useJobs';

interface StatusItemProps {
  icon?: ComponentType;
  label: string;
  onClick?: () => void;
  title?: string;
}

function StatusItem({ icon, label, onClick, title }: StatusItemProps) {
  return (
    <HStack
      spacing="4px"
      px={2}
      h={`${VS.size.statusBar}px`}
      cursor={onClick ? 'pointer' : 'default'}
      title={title}
      _hover={onClick ? { bg: 'rgba(255,255,255,0.15)' } : undefined}
      onClick={onClick}
      flexShrink={0}
    >
      {icon && <Icon as={icon as ComponentType} boxSize="11px" />}
      <Text fontSize="11px" lineHeight={1} whiteSpace="nowrap">
        {label}
      </Text>
    </HStack>
  );
}

/**
 * VS Code-style status bar — blue strip at the very bottom.
 * Left side: branch / error counts.
 * Right side: queue count, total jobs, encoding info.
 */
export default function StatusBar() {
  const navigate = useNavigate();
  const colors = useVSColors();
  const { data: stats } = useJobStatistics();

  const totalJobs  = stats?.total_jobs  ?? 0;
  const queueCount = stats?.queue_count ?? 0;
  const errorCount = (stats?.by_state?.['REGENERATE_REQUESTED'] ?? 0)
                   + (stats?.by_state?.['CODE_REGENERATE_REQUESTED'] ?? 0);

  return (
    <Flex
      h={`${VS.size.statusBar}px`}
      bg={colors.statusBar}
      color={colors.statusBarFg}
      align="center"
      justify="space-between"
      flexShrink={0}
      userSelect="none"
      overflow="hidden"
    >
      {/* ── Left ─────────────────────────────────── */}
      <HStack spacing={0}>
        <StatusItem icon={FiGitBranch} label="main" title="Git branch" />
        <StatusItem
          icon={FiAlertCircle}
          label={String(errorCount)}
          title={`${errorCount} jobs awaiting regeneration`}
          onClick={() => navigate('/jobs')}
        />
        <StatusItem icon={FiCheckCircle} label="0" title="Warnings" />
      </HStack>

      {/* ── Right ────────────────────────────────── */}
      <HStack spacing={0}>
        {queueCount > 0 && (
          <StatusItem
            icon={FiZap}
            label={`${queueCount} queued`}
            title="Jobs waiting for code conversion"
            onClick={() => navigate('/jobs?tab=queue')}
          />
        )}
        <StatusItem label={`${totalJobs} jobs`} title="Total jobs" onClick={() => navigate('/jobs')} />
        <StatusItem label="UTF-8" />
        <StatusItem label="LF" />
        <StatusItem label="TypeScript JSX" />
      </HStack>
    </Flex>
  );
}
