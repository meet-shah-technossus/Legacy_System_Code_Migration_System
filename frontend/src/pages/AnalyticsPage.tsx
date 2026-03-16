import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  Container,
  Divider,
  Flex,
  Grid,
  GridItem,
  Heading,
  HStack,
  Icon,
  Skeleton,
  SkeletonText,
  Stat,
  StatHelpText,
  StatLabel,
  StatNumber,
  Text,
  Tooltip,
  useColorModeValue,
  VStack,
  CircularProgress,
  CircularProgressLabel,
} from '@chakra-ui/react';
import {
  FiActivity,
  FiAlertCircle,
  FiBarChart2,
  FiCheckCircle,
  FiClock,
  FiRefreshCw,
  FiTrendingUp,
  FiZap,
} from 'react-icons/fi';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { useMetricsSummary, usePerformanceStats, useSuccessRate } from '../hooks/useAudit';
import { useJobStatistics } from '../hooks/useJobs';
import { formatDuration, formatPercent, stateLabel } from '../utils/format';
import type { JobState } from '../types';

// ─── Time range options ───────────────────────────────────────────────────────

const TIME_RANGES = [
  { label: '24 h', hours: 24 },
  { label: '48 h', hours: 48 },
  { label: '7 d', hours: 168 },
];

// ─── Color palette ────────────────────────────────────────────────────────────

const CHART_COLORS = {
  success: '#48BB78',
  failure: '#FC8181',
  brand: '#4299E1',
  purple: '#9F7AEA',
  orange: '#ED8936',
  teal: '#38B2AC',
  gray: '#718096',
};

const STATE_COLORS: Record<string, string> = {
  CREATED: '#718096',
  YAML_GENERATED: '#0BC5EA',
  UNDER_REVIEW: '#ED8936',
  REGENERATE_REQUESTED: '#F6E05E',
  APPROVED: '#68D391',
  APPROVED_WITH_COMMENTS: '#48BB78',
  CODE_GENERATED: '#B794F4',
  COMPLETED: '#38A169',
  // Direct Conversion states
  DIRECT_CODE_GENERATED: '#7c3aed',
  DIRECT_CODE_UNDER_REVIEW: '#9333ea',
  DIRECT_CODE_REGENERATE_REQUESTED: '#f59e0b',
  DIRECT_CODE_ACCEPTED: '#10b981',
  DIRECT_COMPLETED: '#059669',
};

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  colorScheme = 'blue',
  isLoading = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof FiActivity;
  colorScheme?: string;
  isLoading?: boolean;
}) {
  const bg = useColorModeValue('white', 'gray.800');
  const border = useColorModeValue('gray.200', 'gray.700');
  const iconBg = useColorModeValue(`${colorScheme}.100`, `${colorScheme}.900`);
  const iconColor = `${colorScheme}.400`;

  return (
    <Box bg={bg} border="1px solid" borderColor={border} borderRadius="xl" p={5}>
      <Flex justify="space-between" align="flex-start">
        <Stat>
          <StatLabel color="gray.500" fontSize="sm">{label}</StatLabel>
          {isLoading ? (
            <Skeleton h="36px" mt={2} />
          ) : (
            <StatNumber fontSize="2xl" fontWeight="bold" mt={1}>{value}</StatNumber>
          )}
          {sub && !isLoading && (
            <StatHelpText fontSize="xs" mb={0} mt={1}>{sub}</StatHelpText>
          )}
        </Stat>
        <Box bg={iconBg} borderRadius="lg" p={2.5}>
          <Icon as={icon} boxSize={5} color={iconColor} />
        </Box>
      </Flex>
    </Box>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  badge,
  children,
  isLoading = false,
  minH,
}: {
  title: string;
  subtitle?: string;
  badge?: { label: string; colorScheme: string };
  children: React.ReactNode;
  isLoading?: boolean;
  minH?: string;
}) {
  const bg = useColorModeValue('white', 'gray.800');
  const border = useColorModeValue('gray.200', 'gray.700');

  return (
    <Box bg={bg} border="1px solid" borderColor={border} borderRadius="xl" p={5} minH={minH}>
      <Flex justify="space-between" align="flex-start" mb={4}>
        <VStack align="start" spacing={0.5}>
          <Heading size="sm">{title}</Heading>
          {subtitle && <Text fontSize="xs" color="gray.500">{subtitle}</Text>}
        </VStack>
        {badge && (
          <Badge colorScheme={badge.colorScheme} variant="subtle" fontSize="xs">
            {badge.label}
          </Badge>
        )}
      </Flex>
      {isLoading ? <SkeletonText noOfLines={5} spacing={3} /> : children}
    </Box>
  );
}

// ─── Success rate donut ───────────────────────────────────────────────────────

function SuccessDonut({
  successCount,
  failureCount,
  label,
}: {
  successCount: number;
  failureCount: number;
  label: string;
}) {
  const total = successCount + failureCount;
  const rate = total > 0 ? (successCount / total) * 100 : 0;
  const color = rate >= 80 ? 'green.400' : rate >= 50 ? 'yellow.400' : 'red.400';
  const trackColor = useColorModeValue('gray.200', 'gray.700');

  return (
    <Flex align="center" gap={5} wrap="wrap">
      <Box position="relative" flexShrink={0}>
        <CircularProgress
          value={rate}
          size="100px"
          thickness="10px"
          color={color}
          trackColor={trackColor}
        >
          <CircularProgressLabel fontWeight="bold" fontSize="md">
            {total > 0 ? `${rate.toFixed(0)}%` : '—'}
          </CircularProgressLabel>
        </CircularProgress>
      </Box>
      <VStack align="start" spacing={2} flex={1} minW="120px">
        <Text fontSize="xs" color="gray.500" fontWeight="medium">{label}</Text>
        <HStack spacing={4}>
          <VStack align="start" spacing={0}>
            <Text fontSize="xs" color="gray.400">Success</Text>
            <Text fontSize="lg" fontWeight="bold" color="green.400">{successCount}</Text>
          </VStack>
          <VStack align="start" spacing={0}>
            <Text fontSize="xs" color="gray.400">Failure</Text>
            <Text fontSize="lg" fontWeight="bold" color="red.400">{failureCount}</Text>
          </VStack>
          <VStack align="start" spacing={0}>
            <Text fontSize="xs" color="gray.400">Total</Text>
            <Text fontSize="lg" fontWeight="bold">{total}</Text>
          </VStack>
        </HStack>
      </VStack>
    </Flex>
  );
}

// ─── Performance bar row ──────────────────────────────────────────────────────

function PerfRow({
  min,
  max,
  avg,
  count,
}: {
  min: number | null;
  max: number | null;
  avg: number | null;
  count: number;
}) {
  const bg = useColorModeValue('gray.50', 'gray.900');
  const stats = [
    { label: 'Avg', value: avg },
    { label: 'Min', value: min },
    { label: 'Max', value: max },
  ];

  return (
    <Box bg={bg} borderRadius="lg" p={3} mt={3}>
      <Flex gap={4} wrap="wrap">
        {stats.map(({ label, value }) => (
          <VStack key={label} align="start" spacing={0} minW="80px">
            <Text fontSize="xs" color="gray.500">{label} duration</Text>
            <Text fontSize="sm" fontWeight="semibold" fontFamily="mono">
              {formatDuration(value)}
            </Text>
          </VStack>
        ))}
        <VStack align="start" spacing={0} minW="60px">
          <Text fontSize="xs" color="gray.500">Operations</Text>
          <Text fontSize="sm" fontWeight="semibold">{count}</Text>
        </VStack>
      </Flex>
    </Box>
  );
}

// ─── Jobs by state bar chart ──────────────────────────────────────────────────

function JobsStateChart({ byState }: { byState: Record<string, number> }) {
  const gridColor = useColorModeValue('#E2E8F0', '#2D3748');
  const textColor = useColorModeValue('#4A5568', '#A0AEC0');

  const data = Object.entries(byState)
    .filter(([, v]) => v > 0)
    .map(([state, count]) => ({
      state: stateLabel(state as JobState),
      count,
      fill: STATE_COLORS[state] ?? CHART_COLORS.gray,
    }))
    .sort((a, b) => b.count - a.count);

  if (data.length === 0) {
    return (
      <Flex align="center" justify="center" h="180px" direction="column" gap={2}>
        <Icon as={FiBarChart2} boxSize={10} color="gray.500" />
        <Text color="gray.400" fontSize="sm">No job data yet</Text>
      </Flex>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 40, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis
          dataKey="state"
          tick={{ fill: textColor, fontSize: 10 }}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={{ fill: textColor, fontSize: 10 }} allowDecimals={false} />
        <ReTooltip
          contentStyle={{ background: '#2D3748', border: 'none', borderRadius: 8 }}
          labelStyle={{ color: '#fff' }}
          itemStyle={{ color: '#E2E8F0' }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((entry, idx) => (
            <Cell key={idx} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Review outcomes chart ────────────────────────────────────────────────────

function ReviewOutcomesChart({
  approved,
  approvedWithComments,
  rejected,
}: {
  approved: number;
  approvedWithComments: number;
  rejected: number;
}) {
  const total = approved + approvedWithComments + rejected;
  if (total === 0) {
    return (
      <Flex align="center" justify="center" h="120px" direction="column" gap={2}>
        <Icon as={FiCheckCircle} boxSize={8} color="gray.500" />
        <Text color="gray.400" fontSize="sm">No reviews yet</Text>
      </Flex>
    );
  }

  const data = [
    { name: 'Approved', value: approved, fill: CHART_COLORS.success },
    { name: 'With Comments', value: approvedWithComments, fill: CHART_COLORS.teal },
    { name: 'Rejected', value: rejected, fill: CHART_COLORS.failure },
  ].filter((d) => d.value > 0);

  return (
    <Flex align="center" gap={4} wrap="wrap">
      <ResponsiveContainer width={120} height={120}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={30}
            outerRadius={55}
            dataKey="value"
            paddingAngle={3}
          >
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Pie>
          <ReTooltip
            contentStyle={{ background: '#2D3748', border: 'none', borderRadius: 8 }}
            labelStyle={{ color: '#fff' }}
            itemStyle={{ color: '#E2E8F0' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <VStack align="start" spacing={2}>
        {data.map((d) => (
          <HStack key={d.name} spacing={2}>
            <Box w={3} h={3} borderRadius="sm" bg={d.fill} flexShrink={0} />
            <Text fontSize="xs" color="gray.400">{d.name}</Text>
            <Text fontSize="xs" fontWeight="bold">{d.value}</Text>
            <Text fontSize="xs" color="gray.500">
              ({((d.value / total) * 100).toFixed(0)}%)
            </Text>
          </HStack>
        ))}
      </VStack>
    </Flex>
  );
}

// ─── Operations comparison chart ─────────────────────────────────────────────

function OperationsComparisonChart({
  yamlSuccess,
  yamlFail,
  codeSuccess,
  codeFail,
}: {
  yamlSuccess: number;
  yamlFail: number;
  codeSuccess: number;
  codeFail: number;
}) {
  const gridColor = useColorModeValue('#E2E8F0', '#2D3748');
  const textColor = useColorModeValue('#4A5568', '#A0AEC0');

  const data = [
    {
      name: 'YAML Generation',
      Success: yamlSuccess,
      Failure: yamlFail,
    },
    {
      name: 'Code Generation',
      Success: codeSuccess,
      Failure: codeFail,
    },
  ];

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: textColor, fontSize: 11 }} />
        <YAxis tick={{ fill: textColor, fontSize: 11 }} allowDecimals={false} />
        <ReTooltip
          contentStyle={{ background: '#2D3748', border: 'none', borderRadius: 8 }}
          labelStyle={{ color: '#fff' }}
          itemStyle={{ color: '#E2E8F0' }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: textColor }} />
        <Bar dataKey="Success" fill={CHART_COLORS.success} radius={[4, 4, 0, 0]} />
        <Bar dataKey="Failure" fill={CHART_COLORS.failure} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Analytics Page ───────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [hours, setHours] = useState(24);

  const { data: summary, isLoading: summaryLoading, refetch, isFetching } = useMetricsSummary(hours);
  const { data: jobStats, isLoading: statsLoading } = useJobStatistics();
  const { data: yamlPerf, isLoading: yamlPerfLoading } = usePerformanceStats('yaml_generation', hours);
  const { data: codePerf, isLoading: codePerfLoading } = usePerformanceStats('code_generation', hours);

  const isLoading = summaryLoading || statsLoading;

  const totalJobs = jobStats?.total_jobs ?? 0;
  const completedJobs = jobStats?.by_state?.COMPLETED ?? 0;
  const completeRate = totalJobs > 0 ? formatPercent(completedJobs / totalJobs) : '—';

  const yamlSuccessRate = summary
    ? summary.yaml_generation.success_rate.success_rate.toFixed(1) + '%'
    : '—';
  const codeSuccessRate = summary
    ? summary.code_generation.success_rate.success_rate.toFixed(1) + '%'
    : '—';

  const totalErrors = summary?.errors.total ?? 0;

  // Direct Conversion stats (from by_job_type and by_state)
  const directJobs = (jobStats?.by_job_type as Record<string, number> | undefined)?.direct_conversion ?? 0;
  const directCompleted = (jobStats?.by_state?.DIRECT_COMPLETED as number) ?? 0;
  const directActive = (
    ((jobStats?.by_state?.DIRECT_CODE_GENERATED as number) ?? 0) +
    ((jobStats?.by_state?.DIRECT_CODE_UNDER_REVIEW as number) ?? 0) +
    ((jobStats?.by_state?.DIRECT_CODE_REGENERATE_REQUESTED as number) ?? 0) +
    ((jobStats?.by_state?.DIRECT_CODE_ACCEPTED as number) ?? 0)
  );
  const directCompletionRate = directJobs > 0
    ? `${Math.round((directCompleted / directJobs) * 100)}%`
    : '—';
  const yamlPipelineJobs = (
    (((jobStats?.by_job_type as Record<string, number> | undefined)?.job1_yaml_conversion) ?? 0) +
    (((jobStats?.by_job_type as Record<string, number> | undefined)?.job2_code_conversion) ?? 0)
  );

  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  return (
    <Container maxW="full" py={6} px={{ base: 4, md: 8 }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <Flex align="center" justify="space-between" mb={6} gap={4} flexWrap="wrap">
        <HStack spacing={3}>
          <Icon as={FiBarChart2} boxSize={6} color="brand.400" />
          <Heading size="lg">Analytics</Heading>
        </HStack>
        <HStack spacing={3}>
          <ButtonGroup size="sm" isAttached variant="outline">
            {TIME_RANGES.map((r) => (
              <Button
                key={r.hours}
                onClick={() => setHours(r.hours)}
                colorScheme={hours === r.hours ? 'brand' : 'gray'}
                variant={hours === r.hours ? 'solid' : 'outline'}
              >
                {r.label}
              </Button>
            ))}
          </ButtonGroup>
          <Tooltip label="Refresh" hasArrow>
            <Button
              leftIcon={<FiRefreshCw />}
              size="sm"
              variant="ghost"
              isLoading={isFetching}
              onClick={() => refetch()}
            >
              Refresh
            </Button>
          </Tooltip>
        </HStack>
      </Flex>

      {/* ── Top stat cards ───────────────────────────────────── */}
      <Grid templateColumns={{ base: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }} gap={4} mb={6}>
        <StatCard
          label="Total Jobs"
          value={isLoading ? '—' : totalJobs}
          sub={`${completedJobs} completed (${completeRate})`}
          icon={FiActivity}
          colorScheme="blue"
          isLoading={isLoading}
        />
        <StatCard
          label={`YAML Success Rate (${hours}h)`}
          value={summaryLoading ? '—' : yamlSuccessRate}
          sub={`${summary?.yaml_generation.success_rate.success_count ?? 0} successful`}
          icon={FiZap}
          colorScheme="cyan"
          isLoading={summaryLoading}
        />
        <StatCard
          label={`Code Gen Success (${hours}h)`}
          value={summaryLoading ? '—' : codeSuccessRate}
          sub={`${summary?.code_generation.success_rate.success_count ?? 0} successful`}
          icon={FiTrendingUp}
          colorScheme="purple"
          isLoading={summaryLoading}
        />
        <StatCard
          label={`Errors (${hours}h)`}
          value={summaryLoading ? '—' : totalErrors}
          sub={totalErrors === 0 ? 'No errors recorded' : 'Total error events'}
          icon={FiAlertCircle}
          colorScheme={totalErrors > 0 ? 'red' : 'green'}
          isLoading={summaryLoading}
        />
      </Grid>

      {/* ── Main grid ───────────────────────────────────────── */}
      <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={5} mb={5}>
        {/* YAML Generation */}
        <SectionCard
          title="YAML Generation"
          subtitle={`Last ${hours} hours`}
          badge={{
            label: yamlSuccessRate,
            colorScheme:
              parseFloat(yamlSuccessRate) >= 80
                ? 'green'
                : parseFloat(yamlSuccessRate) >= 50
                ? 'yellow'
                : 'red',
          }}
          isLoading={summaryLoading || yamlPerfLoading}
        >
          {summary && (
            <>
              <SuccessDonut
                successCount={summary.yaml_generation.success_rate.success_count}
                failureCount={summary.yaml_generation.success_rate.failure_count}
                label="Operation outcomes"
              />
              {yamlPerf && (
                <PerfRow
                  min={yamlPerf.min_seconds}
                  max={yamlPerf.max_seconds}
                  avg={yamlPerf.avg_seconds}
                  count={yamlPerf.count}
                />
              )}
            </>
          )}
        </SectionCard>

        {/* Code Generation */}
        <SectionCard
          title="Code Generation"
          subtitle={`Last ${hours} hours`}
          badge={{
            label: codeSuccessRate,
            colorScheme:
              parseFloat(codeSuccessRate) >= 80
                ? 'green'
                : parseFloat(codeSuccessRate) >= 50
                ? 'yellow'
                : 'red',
          }}
          isLoading={summaryLoading || codePerfLoading}
        >
          {summary && (
            <>
              <SuccessDonut
                successCount={summary.code_generation.success_rate.success_count}
                failureCount={summary.code_generation.success_rate.failure_count}
                label="Operation outcomes"
              />
              {codePerf && (
                <PerfRow
                  min={codePerf.min_seconds}
                  max={codePerf.max_seconds}
                  avg={codePerf.avg_seconds}
                  count={codePerf.count}
                />
              )}
            </>
          )}
        </SectionCard>
      </Grid>

      {/* ── Second row ──────────────────────────────────────── */}
      <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={5} mb={5}>
        {/* Jobs by state */}
        <SectionCard title="Jobs by State" subtitle="All time" isLoading={statsLoading}>
          {jobStats?.by_state && <JobsStateChart byState={jobStats.by_state} />}
        </SectionCard>

        {/* Reviews */}
        <SectionCard
          title="Review Outcomes"
          subtitle={`Last ${hours} hours`}
          isLoading={summaryLoading}
        >
          {summary && (
            <>
              <ReviewOutcomesChart
                approved={summary.reviews.approved}
                approvedWithComments={0}
                rejected={summary.reviews.rejected}
              />
              <Divider my={3} />
              <Flex justify="space-between">
                <VStack align="start" spacing={0}>
                  <Text fontSize="xs" color="gray.500">Total Reviews</Text>
                  <Text fontSize="xl" fontWeight="bold">{summary.reviews.submitted}</Text>
                </VStack>
                <VStack align="end" spacing={0}>
                  <Text fontSize="xs" color="gray.500">Approval Rate</Text>
                  <Text fontSize="xl" fontWeight="bold" color="green.400">
                    {summary.reviews.submitted > 0
                      ? formatPercent(summary.reviews.approved / summary.reviews.submitted)
                      : '—'}
                  </Text>
                </VStack>
              </Flex>
            </>
          )}
        </SectionCard>
      </Grid>

      {/* ── Operations comparison ────────────────────────────── */}
      <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={5} mb={5}>
        <SectionCard
          title="Operations Comparison"
          subtitle={`Success vs failure — last ${hours} hours`}
          isLoading={summaryLoading}
        >
          {summary && (
            <OperationsComparisonChart
              yamlSuccess={summary.yaml_generation.success_rate.success_count}
              yamlFail={summary.yaml_generation.success_rate.failure_count}
              codeSuccess={summary.code_generation.success_rate.success_count}
              codeFail={summary.code_generation.success_rate.failure_count}
            />
          )}
        </SectionCard>

        {/* Summary numbers */}
        <SectionCard title="Period Summary" subtitle={`Last ${hours} hours`} isLoading={summaryLoading}>
          {summary && (
            <VStack align="stretch" spacing={3} divider={<Divider />}>
              {[
                {
                  label: 'Jobs created',
                  value: summary.jobs.created,
                  icon: FiActivity,
                  color: 'blue.400',
                },
                {
                  label: 'Jobs completed',
                  value: summary.jobs.completed,
                  icon: FiCheckCircle,
                  color: 'green.400',
                },
                {
                  label: 'YAML operations',
                  value:
                    summary.yaml_generation.success_rate.success_count +
                    summary.yaml_generation.success_rate.failure_count,
                  icon: FiZap,
                  color: 'cyan.400',
                },
                {
                  label: 'Code generation runs',
                  value:
                    summary.code_generation.success_rate.success_count +
                    summary.code_generation.success_rate.failure_count,
                  icon: FiTrendingUp,
                  color: 'purple.400',
                },
                {
                  label: 'Reviews submitted',
                  value: summary.reviews.submitted,
                  icon: FiCheckCircle,
                  color: 'teal.400',
                },
                {
                  label: 'Errors recorded',
                  value: summary.errors.total,
                  icon: FiAlertCircle,
                  color: summary.errors.total > 0 ? 'red.400' : 'green.400',
                },
              ].map(({ label, value, icon, color }) => (
                <Flex key={label} justify="space-between" align="center">
                  <HStack spacing={2}>
                    <Icon as={icon} boxSize={4} color={color} />
                    <Text fontSize="sm" color="gray.400">{label}</Text>
                  </HStack>
                  <Text fontSize="sm" fontWeight="bold">{value}</Text>
                </Flex>
              ))}
            </VStack>
          )}
        </SectionCard>
      </Grid>

      {/* ── Architecture Overview ────────────────────────────── */}
      <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={5}>
        {/* Pipeline split */}
        <SectionCard
          title="By Architecture"
          subtitle="All-time job type breakdown"
          isLoading={statsLoading}
        >
          {!jobStats ? null : (
            <>
              <Grid templateColumns="repeat(3, 1fr)" gap={4} mb={4}>
                <Box textAlign="center">
                  <Text fontSize="xs" color="gray.500" mb={1}>Two-Step Pipeline</Text>
                  <Text fontSize="2xl" fontWeight="bold" color="cyan.400">{yamlPipelineJobs}</Text>
                  <Text fontSize="xs" color="gray.500">YAML + Code jobs</Text>
                </Box>
                <Box textAlign="center">
                  <Text fontSize="xs" color="gray.500" mb={1}>Direct Conversion</Text>
                  <Text fontSize="2xl" fontWeight="bold" color="purple.400">{directJobs}</Text>
                  <Text fontSize="xs" color="gray.500">{directCompletionRate} completion</Text>
                </Box>
                <Box textAlign="center">
                  <Text fontSize="xs" color="gray.500" mb={1}>Direct Active</Text>
                  <Text fontSize="2xl" fontWeight="bold" color="orange.400">{directActive}</Text>
                  <Text fontSize="xs" color="gray.500">in progress</Text>
                </Box>
              </Grid>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart
                  data={[
                    { name: 'Two-Step Pipeline', count: yamlPipelineJobs, fill: '#0BC5EA' },
                    { name: 'Direct Conversion', count: directJobs, fill: '#7c3aed' },
                  ]}
                  barSize={40}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <ReTooltip
                    contentStyle={{ background: '#2D3748', border: 'none', borderRadius: 8 }}
                    labelStyle={{ color: '#fff' }}
                    itemStyle={{ color: '#E2E8F0' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {[
                      <Cell key="two-step" fill="#0BC5EA" />,
                      <Cell key="direct" fill="#7c3aed" />,
                    ]}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </SectionCard>

        {/* Direct Conversion detail */}
        <SectionCard
          title="Direct Conversion Detail"
          subtitle="State breakdown for direct jobs"
          isLoading={statsLoading}
        >
          {directJobs === 0 ? (
            <Flex h="180px" align="center" justify="center" direction="column" gap={2}>
              <Icon as={FiZap} boxSize={10} color="gray.500" />
              <Text color="gray.400" fontSize="sm">No direct conversion jobs yet</Text>
            </Flex>
          ) : (
            <VStack align="stretch" spacing={3} divider={<Divider />}>
              {[
                { label: 'Total Direct Jobs', value: directJobs, color: 'blue.400' },
                { label: 'Completed', value: directCompleted, color: 'green.400' },
                { label: 'In Progress', value: directActive, color: 'orange.400' },
                { label: 'Completion Rate', value: directCompletionRate, color: 'purple.400' },
              ].map(({ label, value, color }) => (
                <Flex key={label} justify="space-between" align="center">
                  <Text fontSize="sm" color="gray.400">{label}</Text>
                  <Text fontSize="sm" fontWeight="bold" color={color}>{value}</Text>
                </Flex>
              ))}
            </VStack>
          )}
        </SectionCard>
      </Grid>
    </Container>
  );
}
