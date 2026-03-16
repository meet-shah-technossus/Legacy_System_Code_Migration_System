import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Box,
  Button,
  Code,
  Container,
  Divider,
  Flex,
  Heading,
  HStack,
  Icon,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Spinner,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  Text,
  Tooltip,
  useColorModeValue,
  VStack,
  Collapse,
  Alert,
  AlertIcon,
  AlertDescription,
} from '@chakra-ui/react';
import {
  FiActivity,
  FiAlertTriangle,
  FiChevronDown,
  FiChevronRight,
  FiClock,
  FiExternalLink,
  FiFilter,
  FiRefreshCw,
  FiSearch,
  FiUser,
} from 'react-icons/fi';
import { useAuditLogs, useRecentAuditLogs, useErrorAuditLogs } from '../hooks/useAudit';
import { formatDateTime, timeAgo } from '../utils/format';
import { usePrefsStore } from '../store/prefsStore';
import type { AuditLog } from '../types';

// ─── Action metadata ──────────────────────────────────────────────────────────

type ActionMeta = { colorScheme: string; label: string };

const ACTION_META: Record<string, ActionMeta> = {
  // Job lifecycle
  JOB_CREATED: { colorScheme: 'blue', label: 'Job Created' },
  JOB_DELETED: { colorScheme: 'red', label: 'Job Deleted' },
  JOB_COMPLETED: { colorScheme: 'green', label: 'Job Completed' },
  JOB2_CREATED: { colorScheme: 'blue', label: 'Job 2 Created' },
  JOB_QUEUED: { colorScheme: 'cyan', label: 'Job Queued' },
  // State transitions
  STATE_CHANGED: { colorScheme: 'purple', label: 'State Changed' },
  // YAML operations
  YAML_GENERATED: { colorScheme: 'cyan', label: 'YAML Generated' },
  YAML_VALIDATED: { colorScheme: 'teal', label: 'YAML Validated' },
  YAML_VALIDATION_FAILED: { colorScheme: 'red', label: 'Validation Failed' },
  YAML_VERSION_CHANGED: { colorScheme: 'cyan', label: 'YAML Version Changed' },
  // YAML review
  REVIEW_SUBMITTED: { colorScheme: 'orange', label: 'Review Submitted' },
  REGENERATION_REQUESTED: { colorScheme: 'yellow', label: 'Regen Requested' },
  // Code generation (Job 2)
  CODE_GENERATED: { colorScheme: 'purple', label: 'Code Generated' },
  CODE_GENERATION_FAILED: { colorScheme: 'red', label: 'Code Gen Failed' },
  CODE_REVIEW_SUBMITTED: { colorScheme: 'purple', label: 'Code Review Submitted' },
  CODE_REGENERATION_REQUESTED: { colorScheme: 'yellow', label: 'Code Regen Requested' },
  CODE_ACCEPTED: { colorScheme: 'teal', label: 'Code Accepted' },
  // Direct Conversion
  DIRECT_CODE_GENERATED: { colorScheme: 'orange', label: 'Direct Code Generated' },
  DIRECT_CODE_GENERATION_FAILED: { colorScheme: 'red', label: 'Direct Code Failed' },
  DIRECT_CODE_REVIEW_SUBMITTED: { colorScheme: 'orange', label: 'Direct Review Submitted' },
  DIRECT_CODE_REGENERATION_REQUESTED: { colorScheme: 'yellow', label: 'Direct Regen Requested' },
  DIRECT_CODE_ACCEPTED: { colorScheme: 'teal', label: 'Direct Code Accepted' },
  DIRECT_JOB_COMPLETED: { colorScheme: 'green', label: 'Direct Job Completed' },
  // Comments
  LINE_COMMENT_ADDED: { colorScheme: 'cyan', label: 'Line Comment' },
  // Errors & system
  ERROR_OCCURRED: { colorScheme: 'red', label: 'Error' },
  SYSTEM_HEALTH_CHECK: { colorScheme: 'gray', label: 'Health Check' },
};

const ALL_ACTIONS = Object.keys(ACTION_META);

function actionMeta(action: string): ActionMeta {
  return ACTION_META[action] ?? { colorScheme: 'gray', label: action };
}

// ─── Live indicator ───────────────────────────────────────────────────────────

function LiveIndicator({ isFetching, intervalSec = 15 }: { isFetching: boolean; intervalSec?: number }) {
  return (
    <HStack spacing={1.5}>
      {isFetching ? (
        <Spinner size="xs" color="green.400" />
      ) : (
        <Box w={2} h={2} borderRadius="full" bg="green.400"
          sx={{ '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } }, animation: 'pulse 2s infinite' }} />
      )}
      <Text fontSize="xs" color="gray.400">Live · refreshes every {intervalSec}s</Text>
    </HStack>
  );
}

// ─── Log row ──────────────────────────────────────────────────────────────────

function LogRow({ log }: { log: AuditLog }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const meta = actionMeta(log.action);
  const rowHover = useColorModeValue('gray.50', 'gray.750');
  const expandBg = useColorModeValue('gray.50', 'gray.900');
  const borderColor = useColorModeValue('gray.100', 'gray.700');
  const hasDetails = log.details && Object.keys(log.details).length > 0;
  const hasTags = log.tags && Object.keys(log.tags).length > 0;
  const useAbsoluteTimestamps = usePrefsStore((s) => s.useAbsoluteTimestamps);

  return (
    <>
      <Flex
        px={4}
        py={2.5}
        align="center"
        gap={3}
        cursor={hasDetails ? 'pointer' : 'default'}
        _hover={{ bg: rowHover }}
        onClick={() => hasDetails && setExpanded((v) => !v)}
        borderBottom="1px solid"
        borderColor={borderColor}
        flexWrap="nowrap"
        transition="background 0.1s"
      >
        {/* Expand toggle */}
        <Icon
          as={expanded ? FiChevronDown : FiChevronRight}
          boxSize={3.5}
          color={hasDetails ? 'gray.400' : 'transparent'}
          flexShrink={0}
        />

        {/* Timestamp */}
        <Tooltip label={formatDateTime(log.created_at)} hasArrow>
          <Text fontSize="xs" color="gray.400" minW="90px" fontFamily="mono" flexShrink={0}>
            {useAbsoluteTimestamps ? formatDateTime(log.created_at) : timeAgo(log.created_at)}
          </Text>
        </Tooltip>

        {/* Action badge */}
        <Badge
          colorScheme={meta.colorScheme}
          variant="subtle"
          fontSize="xs"
          flexShrink={0}
          minW="fit-content"
        >
          {meta.label}
        </Badge>

        {/* Job link */}
        {log.job_id != null && (
          <Tooltip label={`View Job #${log.job_id}`} hasArrow>
            <Tag
              size="sm"
              colorScheme="gray"
              fontFamily="mono"
              variant="outline"
              cursor="pointer"
              flexShrink={0}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/jobs/${log.job_id}`);
              }}
              _hover={{ bg: 'gray.700' }}
            >
              #{log.job_id}
              <Icon as={FiExternalLink} boxSize={2.5} ml={1} />
            </Tag>
          </Tooltip>
        )}

        {/* Performed by */}
        {log.performed_by && (
          <HStack spacing={1} flexShrink={0}>
            <Icon as={FiUser} boxSize={3} color="gray.400" />
            <Text fontSize="xs" color="gray.400">{log.performed_by}</Text>
          </HStack>
        )}

        {/* Details preview */}
        {hasDetails && !expanded && (
          <Text fontSize="xs" color="gray.500" noOfLines={1} flex={1} minW={0}>
            {Object.entries(log.details ?? {})
              .slice(0, 3)
              .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
              .join('  ·  ')}
          </Text>
        )}
      </Flex>

      {/* Expanded details */}
      <Collapse in={expanded} animateOpacity>
        <Box
          bg={expandBg}
          px={10}
          py={3}
          borderBottom="1px solid"
          borderColor={borderColor}
        >
          <VStack align="stretch" spacing={3}>
            {hasDetails && (
              <Box>
                <Text fontSize="xs" fontWeight="semibold" color="gray.400" mb={1.5} textTransform="uppercase">
                  Details
                </Text>
                <Code
                  display="block"
                  whiteSpace="pre-wrap"
                  fontSize="xs"
                  p={3}
                  borderRadius="md"
                  w="full"
                  overflowX="auto"
                >
                  {JSON.stringify(log.details, null, 2)}
                </Code>
              </Box>
            )}
            {hasTags && (
              <Box>
                <Text fontSize="xs" fontWeight="semibold" color="gray.400" mb={1.5} textTransform="uppercase">
                  Tags
                </Text>
                <HStack spacing={2} flexWrap="wrap">
                  {Object.entries(log.tags ?? {}).map(([k, v]) => (
                    <Tag key={k} size="sm" colorScheme="gray" variant="outline" fontFamily="mono">
                      {k}={JSON.stringify(v)}
                    </Tag>
                  ))}
                </HStack>
              </Box>
            )}
          </VStack>
        </Box>
      </Collapse>
    </>
  );
}

// ─── Log list ─────────────────────────────────────────────────────────────────

function LogList({
  logs,
  isLoading,
  isFetching,
  emptyMessage = 'No audit logs found',
  showLive = false,
  onRefresh,
  intervalSec = 15,
}: {
  logs: AuditLog[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  emptyMessage?: string;
  showLive?: boolean;
  onRefresh?: () => void;
  intervalSec?: number;
}) {
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const headerBg = useColorModeValue('gray.50', 'gray.900');

  return (
    <Box bg={bg} border="1px solid" borderColor={borderColor} borderRadius="xl" overflow="hidden">
      {/* Table header */}
      <Flex bg={headerBg} px={4} py={2} gap={3} align="center" borderBottom="1px solid" borderColor={borderColor}>
        <Box w={3.5} flexShrink={0} />
        <Text fontSize="xs" fontWeight="semibold" color="gray.400" textTransform="uppercase" minW="90px" flexShrink={0}>
          When
        </Text>
        <Text fontSize="xs" fontWeight="semibold" color="gray.400" textTransform="uppercase" minW="140px" flexShrink={0}>
          Action
        </Text>
        <Text fontSize="xs" fontWeight="semibold" color="gray.400" textTransform="uppercase" flex={1}>
          Details
        </Text>
        {showLive && (
          <Flex align="center" gap={2}>
            <LiveIndicator isFetching={isFetching} intervalSec={intervalSec} />
            {onRefresh && (
              <Tooltip label="Refresh now" hasArrow>
                <IconButton
                  aria-label="Refresh"
                  icon={<FiRefreshCw />}
                  size="xs"
                  variant="ghost"
                  isLoading={isFetching}
                  onClick={onRefresh}
                />
              </Tooltip>
            )}
          </Flex>
        )}
      </Flex>

      {isLoading ? (
        <Flex justify="center" align="center" py={16}>
          <Spinner size="xl" color="brand.400" />
        </Flex>
      ) : !logs || logs.length === 0 ? (
        <Flex direction="column" align="center" py={16} gap={3}>
          <Icon as={FiActivity} boxSize={10} color="gray.500" />
          <Text color="gray.400">{emptyMessage}</Text>
        </Flex>
      ) : (
        logs.map((log) => <LogRow key={log.id} log={log} />)
      )}
    </Box>
  );
}

// ─── Recent tab ───────────────────────────────────────────────────────────────

function RecentTab() {
  const [limit, setLimit] = useState(50);
  const auditRefreshInterval = usePrefsStore((s) => s.auditRefreshInterval);
  const { data, isLoading, isFetching, refetch } = useRecentAuditLogs(limit, auditRefreshInterval * 1000);

  return (
    <VStack align="stretch" spacing={4}>
      <Flex justify="space-between" align="center" flexWrap="wrap" gap={3}>
        <HStack spacing={2}>
          <Text fontSize="sm" color="gray.400">Show last</Text>
          <Select
            size="sm"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            maxW="90px"
          >
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
          <Text fontSize="sm" color="gray.400">entries</Text>
        </HStack>
        <Text fontSize="sm" color="gray.500">
          {data?.total ?? 0} entries
        </Text>
      </Flex>
      <LogList
        logs={data?.logs}
        isLoading={isLoading}
        isFetching={isFetching}
        showLive
        onRefresh={() => refetch()}
        emptyMessage="No recent activity"
        intervalSec={auditRefreshInterval}
      />
    </VStack>
  );
}

// ─── Filter tab ───────────────────────────────────────────────────────────────

function FilterTab() {
  const [actionFilter, setActionFilter] = useState('');
  const [performedBy, setPerformedBy] = useState('');
  const [limit, setLimit] = useState(100);
  // Applied params (only update on Search click)
  const [appliedParams, setAppliedParams] = useState<{
    action?: string;
    performed_by?: string;
    limit: number;
  }>({ limit: 100 });

  const { data, isLoading, isFetching, refetch } = useAuditLogs(appliedParams);

  const handleSearch = useCallback(() => {
    setAppliedParams({
      ...(actionFilter ? { action: actionFilter } : {}),
      ...(performedBy.trim() ? { performed_by: performedBy.trim() } : {}),
      limit,
    });
  }, [actionFilter, performedBy, limit]);

  const handleClear = () => {
    setActionFilter('');
    setPerformedBy('');
    setLimit(100);
    setAppliedParams({ limit: 100 });
  };

  return (
    <VStack align="stretch" spacing={4}>
      {/* Filter controls */}
      <Box
        bg={useColorModeValue('white', 'gray.800')}
        border="1px solid"
        borderColor={useColorModeValue('gray.200', 'gray.700')}
        borderRadius="lg"
        p={4}
      >
        <Flex gap={3} flexWrap="wrap" align="flex-end">
          <Icon as={FiFilter} color="gray.400" mt={7} />

          <Box>
            <Text fontSize="xs" color="gray.500" mb={1}>Action type</Text>
            <Select
              placeholder="All actions"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              size="sm"
              minW="200px"
            >
              {ALL_ACTIONS.map((a) => (
                <option key={a} value={a}>{actionMeta(a).label}</option>
              ))}
            </Select>
          </Box>

          <Box>
            <Text fontSize="xs" color="gray.500" mb={1}>Performed by</Text>
            <InputGroup size="sm" minW="180px">
              <InputLeftElement pointerEvents="none">
                <Icon as={FiSearch} color="gray.400" />
              </InputLeftElement>
              <Input
                placeholder="Username…"
                value={performedBy}
                onChange={(e) => setPerformedBy(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </InputGroup>
          </Box>

          <Box>
            <Text fontSize="xs" color="gray.500" mb={1}>Limit</Text>
            <Select
              size="sm"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              minW="90px"
            >
              {[50, 100, 200, 500].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          </Box>

          <HStack spacing={2} mt={1}>
            <Button
              size="sm"
              colorScheme="brand"
              leftIcon={<FiSearch />}
              onClick={handleSearch}
              isLoading={isFetching}
            >
              Search
            </Button>
            {(actionFilter || performedBy) && (
              <Button size="sm" variant="ghost" colorScheme="red" onClick={handleClear}>
                Clear
              </Button>
            )}
          </HStack>
        </Flex>
      </Box>

      {data && (
        <Text fontSize="sm" color="gray.500">
          {data.total} {data.total === 1 ? 'result' : 'results'}
        </Text>
      )}

      <LogList
        logs={data?.logs}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage="No logs match your filters"
      />
    </VStack>
  );
}

// ─── Errors tab ───────────────────────────────────────────────────────────────

function ErrorsTab() {
  const [limit, setLimit] = useState(100);
  const { data, isLoading, isFetching } = useErrorAuditLogs(undefined, limit);

  const errorCount = data?.total ?? 0;

  return (
    <VStack align="stretch" spacing={4}>
      <Flex justify="space-between" align="center" flexWrap="wrap" gap={3}>
        <HStack spacing={2}>
          <Icon as={FiAlertTriangle} color="red.400" />
          <Text fontSize="sm" color="red.400" fontWeight="medium">
            {errorCount} error{errorCount !== 1 ? 's' : ''} recorded
          </Text>
        </HStack>
        <HStack spacing={2}>
          <Text fontSize="sm" color="gray.400">Show last</Text>
          <Select
            size="sm"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            maxW="90px"
          >
            {[50, 100, 200].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        </HStack>
      </Flex>

      {errorCount === 0 && !isLoading && (
        <Alert status="success" borderRadius="lg">
          <AlertIcon />
          <AlertDescription>No errors recorded. The system is healthy.</AlertDescription>
        </Alert>
      )}

      <LogList
        logs={data?.logs?.filter(
          (l) =>
            l.action === 'ERROR_OCCURRED' ||
            l.action === 'YAML_VALIDATION_FAILED' ||
            l.action === 'CODE_GENERATION_FAILED' ||
            l.action === 'DIRECT_CODE_GENERATION_FAILED'
        )}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage="No errors recorded"
      />
    </VStack>
  );
}

// ─── Stats strip ─────────────────────────────────────────────────────────────

function ActionStatsStrip({ logs }: { logs: AuditLog[] | undefined }) {
  if (!logs || logs.length === 0) return null;

  const counts: Record<string, number> = {};
  for (const log of logs) {
    counts[log.action] = (counts[log.action] ?? 0) + 1;
  }

  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <HStack spacing={3} flexWrap="wrap">
      {top.map(([action, count]) => {
        const meta = actionMeta(action);
        return (
          <HStack key={action} spacing={1}>
            <Badge colorScheme={meta.colorScheme} variant="subtle" fontSize="xs">
              {meta.label}
            </Badge>
            <Text fontSize="xs" color="gray.400">{count}</Text>
          </HStack>
        );
      })}
    </HStack>
  );
}

// ─── Audit Log Page ───────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const auditRefreshInterval = usePrefsStore((s) => s.auditRefreshInterval);
  const { data: recentData, isFetching } = useRecentAuditLogs(500, auditRefreshInterval * 1000);
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  const errorCount = recentData?.logs?.filter(
    (l) =>
      l.action === 'ERROR_OCCURRED' ||
      l.action === 'YAML_VALIDATION_FAILED' ||
      l.action === 'CODE_GENERATION_FAILED' ||
      l.action === 'DIRECT_CODE_GENERATION_FAILED'
  ).length ?? 0;

  return (
    <Container maxW="full" py={6} px={{ base: 4, md: 8 }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <Flex align="center" justify="space-between" mb={5} gap={4} flexWrap="wrap">
        <HStack spacing={3}>
          <Icon as={FiActivity} boxSize={6} color="brand.400" />
          <Heading size="lg">Audit Log</Heading>
        </HStack>
        <LiveIndicator isFetching={isFetching} intervalSec={auditRefreshInterval} />
      </Flex>

      {/* ── Action summary strip ─────────────────────────────── */}
      {recentData && recentData.logs.length > 0 && (
        <Box
          bg={bg}
          border="1px solid"
          borderColor={borderColor}
          borderRadius="xl"
          px={5}
          py={3}
          mb={5}
        >
          <Flex align="center" gap={3} flexWrap="wrap">
            <HStack spacing={2} flexShrink={0}>
              <Icon as={FiClock} color="gray.400" boxSize={3.5} />
              <Text fontSize="xs" color="gray.400" fontWeight="medium">
                Recent activity:
              </Text>
            </HStack>
            <ActionStatsStrip logs={recentData.logs} />
          </Flex>
        </Box>
      )}

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <Tabs variant="soft-rounded" colorScheme="brand" isLazy>
        <TabList bg={bg} border="1px solid" borderColor={borderColor} borderRadius="xl" p={2} mb={4}>
          <Tab fontSize="sm">
            <HStack spacing={1.5}>
              <Icon as={FiClock} boxSize={3.5} />
              <Text>Recent Activity</Text>
            </HStack>
          </Tab>
          <Tab fontSize="sm">
            <HStack spacing={1.5}>
              <Icon as={FiFilter} boxSize={3.5} />
              <Text>Filter & Search</Text>
            </HStack>
          </Tab>
          <Tab fontSize="sm">
            <HStack spacing={1.5}>
              <Icon as={FiAlertTriangle} boxSize={3.5} />
              <Text>Errors</Text>
              {errorCount > 0 && (
                <Badge colorScheme="red" variant="solid" borderRadius="full" fontSize="xs" px={1.5}>
                  {errorCount}
                </Badge>
              )}
            </HStack>
          </Tab>
        </TabList>

        <TabPanels>
          <TabPanel p={0}>
            <RecentTab />
          </TabPanel>
          <TabPanel p={0}>
            <FilterTab />
          </TabPanel>
          <TabPanel p={0}>
            <ErrorsTab />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Container>
  );
}
