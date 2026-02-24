import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  Heading,
  HStack,
  Icon,
  Select,
  SimpleGrid,
  Spinner,
  Switch,
  Tag,
  Text,
  Tooltip,
  useColorMode,
  useColorModeValue,
  VStack,
  Alert,
  AlertIcon,
  AlertDescription,
  useToast,
} from '@chakra-ui/react';
import {
  FiActivity,
  FiCheckCircle,
  FiClock,
  FiDatabase,
  FiInfo,
  FiLogOut,
  FiMoon,
  FiRefreshCw,
  FiRotateCcw,
  FiServer,
  FiSettings,
  FiShield,
  FiSliders,
  FiSun,
  FiUser,
  FiXCircle,
  FiZap,
} from 'react-icons/fi';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { usePrefsStore } from '../store/prefsStore';
import type { JobsPageSize, AnalyticsTimeRange, AuditRefreshInterval } from '../store/prefsStore';
import { authApi } from '../services/authApi';
import { formatDate, formatDateTime } from '../utils/format';

// ─── Backend health check ─────────────────────────────────────────────────────

interface HealthData {
  status: string;
  version?: string;
  database?: string;
  llm?: string;
  [key: string]: unknown;
}

function useBackendHealth() {
  return useQuery<HealthData>({
    queryKey: ['health'],
    queryFn: () =>
      axios.get<HealthData>('http://localhost:8000/health').then((r) => r.data),
    retry: 1,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const iconBg = useColorModeValue('blue.50', 'blue.900');

  return (
    <Box bg={bg} border="1px solid" borderColor={borderColor} borderRadius="xl" overflow="hidden">
      <Flex align="center" gap={3} px={5} py={4} borderBottom="1px solid" borderColor={borderColor}
        bg={useColorModeValue('gray.50', 'gray.900')}>
        <Flex
          w={8} h={8} align="center" justify="center"
          bg={iconBg} borderRadius="lg"
        >
          <Icon as={icon} boxSize={4} color="blue.400" />
        </Flex>
        <Heading size="sm">{title}</Heading>
      </Flex>
      <Box px={5} py={4}>
        {children}
      </Box>
    </Box>
  );
}

// ─── Pref row ─────────────────────────────────────────────────────────────────

function PrefRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Flex align="center" justify="space-between" gap={4} py={3}>
      <VStack align="start" spacing={0.5} flex={1} minW={0}>
        <Text fontSize="sm" fontWeight="medium">{label}</Text>
        {description && (
          <Text fontSize="xs" color="gray.400" noOfLines={2}>{description}</Text>
        )}
      </VStack>
      <Box flexShrink={0}>{children}</Box>
    </Flex>
  );
}

// ─── Role badge ───────────────────────────────────────────────────────────────

const ROLE_COLOR: Record<string, string> = {
  admin: 'red',
  developer: 'blue',
  reviewer: 'orange',
  viewer: 'gray',
};

const ROLE_ICON: Record<string, React.ElementType> = {
  admin: FiShield,
  developer: FiZap,
  reviewer: FiActivity,
  viewer: FiUser,
};

// ─── Settings Page ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { colorMode, toggleColorMode } = useColorMode();
  const { user, logout, setUser } = useAuthStore();
  const prefs = usePrefsStore();

  const healthCardBg = useColorModeValue('gray.50', 'gray.900');
  const healthCardBorder = useColorModeValue('gray.100', 'gray.700');
  const [refreshing, setRefreshing] = useState(false);

  // Backend health
  const { data: health, isLoading: healthLoading, isFetching: healthFetching, refetch: refetchHealth } =
    useBackendHealth();

  // Refresh profile from API
  const handleRefreshProfile = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await authApi.getMe();
      setUser(fresh);
      toast({ title: 'Profile refreshed', status: 'success', duration: 2000, isClosable: true });
    } catch {
      toast({ title: 'Could not refresh profile', status: 'error', duration: 3000, isClosable: true });
    } finally {
      setRefreshing(false);
    }
  }, [setUser, toast]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleResetPrefs = () => {
    prefs.resetToDefaults();
    toast({ title: 'Preferences reset to defaults', status: 'info', duration: 2000, isClosable: true });
  };

  if (!user) return null;

  const initials = user.full_name
    ? user.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : user.username.slice(0, 2).toUpperCase();

  const roleColor = ROLE_COLOR[user.role] ?? 'gray';
  const RoleIcon = ROLE_ICON[user.role] ?? FiUser;

  const healthOk = health?.status === 'healthy' || health?.status === 'ok';

  return (
    <Container maxW="5xl" py={6} px={{ base: 4, md: 8 }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <Flex align="center" gap={3} mb={7}>
        <Icon as={FiSettings} boxSize={6} color="brand.400" />
        <Heading size="lg">Settings</Heading>
      </Flex>

      <Grid templateColumns={{ base: '1fr', lg: '320px 1fr' }} gap={6}>
        {/* ── Left column ──────────────────────────────────── */}
        <GridItem>
          <VStack spacing={4} align="stretch">

            {/* Profile card */}
            <SectionCard icon={FiUser} title="Profile">
              <VStack spacing={4} align="center" py={2}>
                <Avatar
                  size="xl"
                  name={user.full_name || user.username}
                  bg={`${roleColor}.500`}
                  color="white"
                  fontSize="2xl"
                />
                <VStack spacing={1} align="center">
                  <Text fontWeight="bold" fontSize="lg">
                    {user.full_name || user.username}
                  </Text>
                  {user.full_name && (
                    <Text fontSize="sm" color="gray.400">@{user.username}</Text>
                  )}
                  <Text fontSize="xs" color="gray.400">{user.email}</Text>
                </VStack>

                <HStack spacing={2}>
                  <Badge colorScheme={roleColor} variant="subtle" display="flex" alignItems="center" gap={1}>
                    <Icon as={RoleIcon} boxSize={2.5} />
                    {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </Badge>
                  <Badge colorScheme={user.is_active ? 'green' : 'red'} variant="subtle">
                    {user.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </HStack>
              </VStack>

              <Divider my={3} />

              <VStack spacing={2} align="stretch">
                <Flex justify="space-between">
                  <Text fontSize="xs" color="gray.500">User ID</Text>
                  <Text fontSize="xs" fontFamily="mono" color="gray.300">#{user.id}</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text fontSize="xs" color="gray.500">Member since</Text>
                  <Text fontSize="xs" color="gray.300">{formatDate(user.created_at)}</Text>
                </Flex>
              </VStack>

              <Divider my={3} />

              <VStack spacing={2}>
                <Button
                  w="full" size="sm" variant="outline"
                  leftIcon={<FiRefreshCw />}
                  isLoading={refreshing}
                  onClick={handleRefreshProfile}
                >
                  Refresh Profile
                </Button>
                <Button
                  w="full" size="sm" colorScheme="red" variant="ghost"
                  leftIcon={<FiLogOut />}
                  onClick={handleLogout}
                >
                  Sign Out
                </Button>
              </VStack>
            </SectionCard>

            {/* Session */}
            <SectionCard icon={FiShield} title="Session">
              <VStack spacing={3} align="stretch">
                <Flex align="center" gap={2}>
                  <Icon
                    as={localStorage.getItem('auth_token') ? FiCheckCircle : FiXCircle}
                    color={localStorage.getItem('auth_token') ? 'green.400' : 'red.400'}
                    boxSize={4}
                  />
                  <Text fontSize="sm">
                    {localStorage.getItem('auth_token') ? 'Token active' : 'No token'}
                  </Text>
                </Flex>
                <Text fontSize="xs" color="gray.500">
                  JWT tokens are stored in localStorage. They expire based on the server's configuration.
                </Text>
                <Button
                  size="sm" colorScheme="red" variant="outline"
                  leftIcon={<FiLogOut />}
                  onClick={handleLogout}
                >
                  Log Out
                </Button>
              </VStack>
            </SectionCard>
          </VStack>
        </GridItem>

        {/* ── Right column ─────────────────────────────────── */}
        <GridItem>
          <VStack spacing={4} align="stretch">

            {/* Display */}
            <SectionCard icon={FiSun} title="Display">
              <VStack spacing={0} align="stretch" divider={<Divider />}>
                <PrefRow
                  label="Color mode"
                  description="Switch between light and dark interface"
                >
                  <HStack spacing={2}>
                    <Icon as={FiSun} color={colorMode === 'light' ? 'yellow.400' : 'gray.400'} boxSize={4} />
                    <Switch
                      isChecked={colorMode === 'dark'}
                      onChange={toggleColorMode}
                      colorScheme="blue"
                    />
                    <Icon as={FiMoon} color={colorMode === 'dark' ? 'blue.300' : 'gray.400'} boxSize={4} />
                  </HStack>
                </PrefRow>

                <PrefRow
                  label="Absolute timestamps"
                  description='Show "Feb 19, 2026 13:45" instead of "5 minutes ago"'
                >
                  <Switch
                    isChecked={prefs.useAbsoluteTimestamps}
                    onChange={(e) => prefs.setUseAbsoluteTimestamps(e.target.checked)}
                    colorScheme="blue"
                  />
                </PrefRow>

                <PrefRow
                  label="Compact tables"
                  description="Reduce row padding for denser information display"
                >
                  <Switch
                    isChecked={prefs.compactTables}
                    onChange={(e) => prefs.setCompactTables(e.target.checked)}
                    colorScheme="blue"
                  />
                </PrefRow>

                <PrefRow
                  label="Auto-expand job details"
                  description="Automatically open the first panel when viewing a job"
                >
                  <Switch
                    isChecked={prefs.autoExpandDetails}
                    onChange={(e) => prefs.setAutoExpandDetails(e.target.checked)}
                    colorScheme="blue"
                  />
                </PrefRow>
              </VStack>
            </SectionCard>

            {/* Jobs */}
            <SectionCard icon={FiSliders} title="Jobs & Data">
              <VStack spacing={0} align="stretch" divider={<Divider />}>
                <PrefRow
                  label="Jobs per page"
                  description="Default number of jobs shown in the Jobs table"
                >
                  <Select
                    size="sm"
                    value={prefs.jobsPageSize}
                    onChange={(e) => prefs.setJobsPageSize(Number(e.target.value) as JobsPageSize)}
                    maxW="100px"
                  >
                    {([10, 25, 50, 100] as JobsPageSize[]).map((n) => (
                      <option key={n} value={n}>{n} rows</option>
                    ))}
                  </Select>
                </PrefRow>

                <PrefRow
                  label="Analytics time range"
                  description="Default time window on the Analytics dashboard"
                >
                  <Select
                    size="sm"
                    value={prefs.analyticsTimeRange}
                    onChange={(e) => prefs.setAnalyticsTimeRange(e.target.value as AnalyticsTimeRange)}
                    maxW="100px"
                  >
                    {(['24h', '48h', '7d', '30d'] as AnalyticsTimeRange[]).map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </Select>
                </PrefRow>

                <PrefRow
                  label="Audit log refresh"
                  description="How often the audit log auto-refreshes"
                >
                  <Select
                    size="sm"
                    value={prefs.auditRefreshInterval}
                    onChange={(e) =>
                      prefs.setAuditRefreshInterval(Number(e.target.value) as AuditRefreshInterval)
                    }
                    maxW="100px"
                  >
                    {([10, 15, 30, 60] as AuditRefreshInterval[]).map((v) => (
                      <option key={v} value={v}>Every {v}s</option>
                    ))}
                  </Select>
                </PrefRow>
              </VStack>

              <Divider my={3} />
              <Flex justify="flex-end">
                <Button
                  size="sm" variant="ghost" colorScheme="red"
                  leftIcon={<FiRotateCcw />}
                  onClick={handleResetPrefs}
                >
                  Reset to defaults
                </Button>
              </Flex>
            </SectionCard>

            {/* System status */}
            <SectionCard icon={FiServer} title="System Status">
              <VStack spacing={3} align="stretch">
                {healthLoading ? (
                  <Flex justify="center" py={4}>
                    <Spinner size="md" color="brand.400" />
                  </Flex>
                ) : health ? (
                  <>
                    <Alert
                      status={healthOk ? 'success' : 'error'}
                      borderRadius="lg"
                      p={3}
                    >
                      <AlertIcon />
                      <AlertDescription fontSize="sm">
                        Backend is <strong>{health.status}</strong>
                      </AlertDescription>
                    </Alert>

                    <SimpleGrid columns={2} spacing={3}>
                      {Object.entries(health)
                        .filter(([k]) => k !== 'status')
                        .map(([k, v]) => (
                          <Flex
                            key={k}
                            align="center"
                            justify="space-between"
                            p={3}
                            bg={healthCardBg}
                            borderRadius="lg"
                            border="1px solid"
                            borderColor={healthCardBorder}
                          >
                            <HStack spacing={2}>
                              <Icon as={FiDatabase} boxSize={3.5} color="gray.400" />
                              <Text fontSize="xs" textTransform="capitalize" color="gray.400">{k}</Text>
                            </HStack>
                            <Tag size="sm" colorScheme={String(v) === 'healthy' || String(v) === 'ok' ? 'green' : 'gray'} variant="subtle">
                              {String(v)}
                            </Tag>
                          </Flex>
                        ))}
                    </SimpleGrid>
                  </>
                ) : (
                  <Alert status="warning" borderRadius="lg" p={3}>
                    <AlertIcon />
                    <AlertDescription fontSize="sm">
                      Could not reach backend at localhost:8000
                    </AlertDescription>
                  </Alert>
                )}

                <Flex justify="flex-end">
                  <Tooltip label="Refresh health status" hasArrow>
                    <Button
                      size="sm" variant="ghost"
                      leftIcon={<FiRefreshCw />}
                      isLoading={healthFetching}
                      onClick={() => refetchHealth()}
                    >
                      Refresh
                    </Button>
                  </Tooltip>
                </Flex>
              </VStack>
            </SectionCard>

            {/* About */}
            <SectionCard icon={FiInfo} title="About">
              <VStack spacing={2} align="stretch">
                <Flex justify="space-between">
                  <Text fontSize="sm" color="gray.500">Application</Text>
                  <Text fontSize="sm" fontWeight="medium">Legacy Migration System</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text fontSize="sm" color="gray.500">Frontend</Text>
                  <Text fontSize="sm" color="gray.300">React 18 + Chakra UI 2 + React Query 5</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text fontSize="sm" color="gray.500">Backend</Text>
                  <Text fontSize="sm" color="gray.300">FastAPI + SQLAlchemy + Gemini LLM</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text fontSize="sm" color="gray.500">Pipeline</Text>
                  <Text fontSize="sm" color="gray.300">Pick Basic → YAML → Modern Code</Text>
                </Flex>
                <Divider />
                <HStack spacing={2} flexWrap="wrap">
                  <Icon as={FiClock} boxSize={3} color="gray.400" />
                  <Text fontSize="xs" color="gray.500">
                    Current time: {formatDateTime(new Date().toISOString())}
                  </Text>
                </HStack>
              </VStack>
            </SectionCard>

          </VStack>
        </GridItem>
      </Grid>
    </Container>
  );
}
