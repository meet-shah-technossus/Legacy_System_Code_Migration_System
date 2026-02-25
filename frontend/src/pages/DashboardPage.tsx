import {
  Box,
  Grid,
  Heading,
  Text,
  VStack,
  HStack,
  Button,
  Badge,
  Skeleton,
  SkeletonText,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Divider,
  Flex,
  Icon,
  Tooltip,
  useColorModeValue,
} from '@chakra-ui/react';
import { Link, useNavigate } from 'react-router-dom';
import { FiLayout } from 'react-icons/fi';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

import { useJobs, useJobStatistics } from '../hooks/useJobs';
import { useMetricsSummary, useRecentAuditLogs } from '../hooks/useAudit';
import { useJobsListPolling } from '../hooks/useSSE';
import {
  stateLabel,
  stateColorScheme,
  timeAgo,
  languageLabel,
  formatDuration,
  formatDateTime,
} from '../utils/format';
import { usePrefsStore } from '../store/prefsStore';
import type { MigrationJobSummary, JobState } from '../types';

// ─── Colour palette for state pie ────────────────────────────────────────────
const STATE_COLORS: Record<string, string> = {
  CREATED: '#718096',
  YAML_GENERATED: '#0BC5EA',
  UNDER_REVIEW: '#ED8936',
  REGENERATE_REQUESTED: '#F6E05E',
  APPROVED: '#68D391',
  APPROVED_WITH_COMMENTS: '#48BB78',
  YAML_APPROVED_QUEUED: '#4FD1C5',
  CODE_GENERATED: '#B794F4',
  CODE_UNDER_REVIEW: '#805AD5',
  CODE_REGENERATE_REQUESTED: '#FC8181',
  CODE_ACCEPTED: '#68D391',
  COMPLETED: '#38A169',
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  colorScheme = 'blue',
  isLoading = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  colorScheme?: string;
  isLoading?: boolean;
}) {
  const bg = useColorModeValue(`${colorScheme}.50`, `${colorScheme}.900`);
  const border = useColorModeValue(`${colorScheme}.200`, `${colorScheme}.700`);
  return (
    <Box bg={bg} border="1px" borderColor={border} borderRadius="xl" p={5}>
      <Stat>
        <StatLabel color="gray.500" fontSize="sm" fontWeight="medium">
          {label}
        </StatLabel>
        {isLoading ? (
          <Skeleton h="36px" mt={2} />
        ) : (
          <StatNumber fontSize="3xl" fontWeight="bold">
            {value}
          </StatNumber>
        )}
        {sub && !isLoading && (
          <StatHelpText fontSize="xs" mb={0}>
            {sub}
          </StatHelpText>
        )}
      </Stat>
    </Box>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function SectionCard({
  title,
  action,
  children,
  isLoading = false,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  isLoading?: boolean;
}) {
  const bg = useColorModeValue('white', 'gray.800');
  const border = useColorModeValue('gray.200', 'gray.700');
  return (
    <Box bg={bg} border="1px" borderColor={border} borderRadius="xl" p={5} h="full">
      <Flex justify="space-between" align="center" mb={4}>
        <Heading size="sm" fontWeight="semibold">
          {title}
        </Heading>
        {action}
      </Flex>
      {isLoading ? <SkeletonText noOfLines={6} spacing={3} /> : children}
    </Box>
  );
}

// ─── Recent Job Row ───────────────────────────────────────────────────────────
function RecentJobRow({ job }: { job: MigrationJobSummary }) {
  const hoverBg = useColorModeValue('gray.50', 'gray.700');
  const useAbsoluteTimestamps = usePrefsStore((s) => s.useAbsoluteTimestamps);
  return (
    <Box
      as={Link}
      to={`/jobs/${job.id}`}
      display="block"
      px={3}
      py={2}
      borderRadius="lg"
      _hover={{ bg: hoverBg, textDecoration: 'none' }}
      transition="background 0.15s"
    >
      <Flex justify="space-between" align="center">
        <VStack align="start" spacing={0.5}>
          <Text fontSize="sm" fontWeight="medium" noOfLines={1}>
            {job.job_name ?? `Job #${job.id}`}
          </Text>
          <HStack spacing={2}>
            <Text fontSize="xs" color="gray.500">
              {languageLabel(job.target_language)}
            </Text>
            <Text fontSize="xs" color="gray.400">·</Text>
            <Text fontSize="xs" color="gray.500">
              {useAbsoluteTimestamps ? formatDateTime(job.updated_at) : timeAgo(job.updated_at)}
            </Text>
          </HStack>
        </VStack>
        <Badge
          colorScheme={stateColorScheme(job.current_state)}
          variant="subtle"
          fontSize="xs"
          px={2}
          py={0.5}
          borderRadius="full"
        >
          {stateLabel(job.current_state)}
        </Badge>
      </Flex>
    </Box>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const useAbsoluteTimestamps = usePrefsStore((s) => s.useAbsoluteTimestamps);

  const { data: jobs, isLoading: jobsLoading } = useJobs({ limit: 8 });
  const { data: stats, isLoading: statsLoading } = useJobStatistics();
  const { data: metrics, isLoading: metricsLoading } = useMetricsSummary(24);
  const { data: auditData, isLoading: auditLoading } = useRecentAuditLogs(10);

  // No async in-progress states in current backend — poll always off
  const ACTIVE_STATES = new Set<string>([
    'YAML_GENERATED', 'UNDER_REVIEW', 'REGENERATE_REQUESTED',
    'APPROVED', 'APPROVED_WITH_COMMENTS', 'CODE_GENERATED',
    'CODE_UNDER_REVIEW', 'CODE_REGENERATE_REQUESTED',
  ]);
  const hasActiveJobs = false;
  useJobsListPolling(hasActiveJobs);

  // ── Computed values ─────────────────────────────────────────────────────────
  const totalJobs = stats?.total_jobs ?? 0;
  const completedJobs = stats?.by_state?.COMPLETED ?? 0;
  const queuedJobs = (stats?.by_state?.YAML_APPROVED_QUEUED ?? 0) as number;
  const activeJobs = jobs?.filter((j) => ACTIVE_STATES.has(j.current_state)).length ?? 0;

  const yamlSuccessRate = metrics
    ? `${metrics.yaml_generation.success_rate.success_rate.toFixed(0)}%`
    : '—';

  // ── Pie: jobs by state ───────────────────────────────────────────────────────
  const pieData = stats?.by_state
    ? Object.entries(stats.by_state)
        .filter(([, count]) => (count as number) > 0)
        .map(([state, count]) => ({
          name: stateLabel(state as JobState),
          value: count as number,
          fill: STATE_COLORS[state] ?? '#718096',
        }))
    : [];

  // ── Bar: success vs failure ──────────────────────────────────────────────────
  const successBarData = metrics
    ? [
        {
          name: 'YAML Gen',
          Success: metrics.yaml_generation.success_rate.success_count,
          Failure: metrics.yaml_generation.success_rate.failure_count,
        },
        {
          name: 'Code Gen',
          Success: metrics.code_generation.success_rate.success_count,
          Failure: metrics.code_generation.success_rate.failure_count,
        },
        {
          name: 'Reviews',
          Success: metrics.reviews.approved,
          Failure: metrics.reviews.rejected,
        },
      ]
    : [];

  // ── Language breakdown ───────────────────────────────────────────────────────
  const langData = stats?.by_language
    ? Object.entries(stats.by_language)
        .filter(([, count]) => (count as number) > 0)
        .map(([lang, count]) => ({ name: languageLabel(lang), count: count as number }))
    : [];

  const textMuted = useColorModeValue('gray.500', 'gray.400');

  return (
    <VStack spacing={6} align="stretch">
      {/* Header */}
      <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
        <Box>
          <Heading size="lg">Dashboard</Heading>
          <Text color={textMuted} mt={0.5} fontSize="sm">
            Legacy Code Migration System · Last 24 h overview
          </Text>
        </Box>
        <HStack spacing={2}>
          <Tooltip label="Open VS Code Studio" hasArrow>
            <Button
              leftIcon={<Icon as={FiLayout} />}
              colorScheme="purple"
              variant="outline"
              size="sm"
              onClick={() => navigate('/')}
            >
              Open Studio
            </Button>
          </Tooltip>
          <Button colorScheme="blue" size="sm" onClick={() => navigate('/jobs/new')}>
            + New Migration Job
          </Button>
        </HStack>
      </Flex>

      {/* Stat cards */}
      <Grid templateColumns={{ base: '1fr 1fr', md: 'repeat(3, 1fr)', xl: 'repeat(5, 1fr)' }} gap={4}>
        <StatCard
          label="Total Jobs"
          value={totalJobs}
          sub={`${completedJobs} completed`}
          colorScheme="blue"
          isLoading={statsLoading}
        />
        <StatCard
          label="Active Now"
          value={activeJobs}
          sub="Generating / reviewing"
          colorScheme="orange"
          isLoading={jobsLoading}
        />
        <StatCard
          label="Queued for Code"
          value={queuedJobs}
          sub="Ready to pick up in Studio"
          colorScheme="teal"
          isLoading={statsLoading}
        />
        <StatCard
          label="YAML Success Rate"
          value={yamlSuccessRate}
          sub={
            metrics
              ? `${metrics.yaml_generation.success_rate.total_count} attempts`
              : undefined
          }
          colorScheme="purple"
          isLoading={metricsLoading}
        />
        <StatCard
          label="Errors (24 h)"
          value={metrics?.errors.total ?? '—'}
          sub={(() => {
            const r1 = (stats?.by_state?.REGENERATE_REQUESTED as number) ?? 0;
            const r2 = (stats?.by_state?.CODE_REGENERATE_REQUESTED as number) ?? 0;
            const total = r1 + r2;
            return total > 0 ? `${total} regen requests` : 'No regeneration requests';
          })()}
          colorScheme={metrics && metrics.errors.total > 0 ? 'red' : 'green'}
          isLoading={metricsLoading}
        />
      </Grid>

      {/* Charts row */}
      <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={5}>
        {/* Jobs by state */}
        <SectionCard title="Jobs by State" isLoading={statsLoading}>
          {pieData.length === 0 ? (
            <Flex h="200px" align="center" justify="center" direction="column" gap={2}>
              <Text fontSize="3xl">🗂️</Text>
              <Text color={textMuted} fontSize="sm">No jobs yet</Text>
              <Button as={Link} to="/jobs/new" size="xs" colorScheme="blue" variant="ghost">
                Create your first migration →
              </Button>
            </Flex>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <RechartTooltip formatter={(v: number, n: string) => [v, n]} />
                <Legend formatter={(v) => <span style={{ fontSize: '11px' }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        {/* Success vs Failure */}
        <SectionCard title="Success vs Failure (24 h)" isLoading={metricsLoading}>
          {successBarData.every((d) => d.Success === 0 && d.Failure === 0) ? (
            <Flex h="200px" align="center" justify="center" direction="column" gap={2}>
              <Text fontSize="3xl">📈</Text>
              <Text color={textMuted} fontSize="sm">No activity in the last 24 h</Text>
            </Flex>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={successBarData} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <RechartTooltip />
                <Legend formatter={(v) => <span style={{ fontSize: '11px' }}>{v}</span>} />
                <Bar dataKey="Success" fill="#48BB78" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Failure" fill="#FC8181" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </Grid>

      {/* Bottom row: recent jobs + language + perf */}
      <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={5}>
        {/* Recent jobs */}
        <SectionCard
          title="Recent Jobs"
          isLoading={jobsLoading}
          action={
            <Button as={Link} to="/jobs" size="xs" variant="ghost" colorScheme="blue">
              View all →
            </Button>
          }
        >
          {!jobs || jobs.length === 0 ? (
            <Flex h="180px" align="center" justify="center" direction="column" gap={2}>
              <Text fontSize="3xl">📋</Text>
              <Text color={textMuted} fontSize="sm">No migration jobs yet</Text>
              <Button as={Link} to="/jobs/new" size="xs" colorScheme="blue" variant="ghost">
                Create your first migration →
              </Button>
            </Flex>
          ) : (
            <VStack spacing={1} align="stretch">
              {jobs.slice(0, 8).map((job) => (
                <RecentJobRow key={job.id} job={job} />
              ))}
            </VStack>
          )}
        </SectionCard>

        {/* Side column */}
        <VStack spacing={5} align="stretch">
          <SectionCard title="By Language" isLoading={statsLoading}>
            {langData.length === 0 ? (
              <Text color={textMuted} fontSize="sm">No data</Text>
            ) : (
              <VStack spacing={2} align="stretch">
                {langData.map(({ name, count }) => (
                  <Flex key={name} justify="space-between" align="center">
                    <Text fontSize="sm">{name}</Text>
                    <Badge colorScheme="blue" variant="subtle">{count}</Badge>
                  </Flex>
                ))}
              </VStack>
            )}
          </SectionCard>

          <SectionCard title="Avg Performance" isLoading={metricsLoading}>
            <VStack spacing={3} align="stretch">
              <Flex justify="space-between">
                <Text fontSize="sm" color={textMuted}>YAML gen avg</Text>
                <Text fontSize="sm" fontWeight="medium">
                  {metrics ? formatDuration(metrics.yaml_generation.performance.avg) : '—'}
                </Text>
              </Flex>
              <Divider />
              <Flex justify="space-between">
                <Text fontSize="sm" color={textMuted}>Code gen avg</Text>
                <Text fontSize="sm" fontWeight="medium">
                  {metrics ? formatDuration(metrics.code_generation.performance.avg) : '—'}
                </Text>
              </Flex>
              <Divider />
              <Flex justify="space-between">
                <Text fontSize="sm" color={textMuted}>Reviews (24 h)</Text>
                <Text fontSize="sm" fontWeight="medium">
                  {metrics?.reviews.submitted ?? '—'} submitted
                </Text>
              </Flex>
            </VStack>
          </SectionCard>
        </VStack>
      </Grid>

      {/* Recent audit log */}
      <SectionCard
        title="Recent Activity"
        isLoading={auditLoading}
        action={
          <Button as={Link} to="/audit" size="xs" variant="ghost" colorScheme="blue">
            Full log →
          </Button>
        }
      >
        {!auditData || auditData.logs.length === 0 ? (
          <Text color={textMuted} fontSize="sm">No activity recorded yet</Text>
        ) : (
          <VStack spacing={0} align="stretch" divider={<Divider />}>
            {auditData.logs.slice(0, 8).map((log) => (
              <Flex
                key={log.id}
                py={2}
                px={1}
                justify="space-between"
                align="center"
                wrap="wrap"
                gap={1}
              >
                <HStack spacing={3}>
                  <Badge
                    colorScheme={
                      log.action.includes('FAIL') || log.action.includes('ERROR')
                        ? 'red'
                        : log.action.includes('COMPLETE') || log.action.includes('APPROV')
                        ? 'green'
                        : 'blue'
                    }
                    variant="subtle"
                    fontSize="2xs"
                  >
                    {log.action}
                  </Badge>
                  {log.job_id && (
                    <Text fontSize="xs" color={textMuted}>
                      Job #{log.job_id}
                    </Text>
                  )}
                  {log.performed_by && (
                    <Text fontSize="xs" color={textMuted}>
                      by {log.performed_by}
                    </Text>
                  )}
                </HStack>
                <Text fontSize="xs" color={textMuted}>
                  {useAbsoluteTimestamps ? formatDateTime(log.created_at) : timeAgo(log.created_at)}
                </Text>
              </Flex>
            ))}
          </VStack>
        )}
      </SectionCard>
    </VStack>
  );
}
