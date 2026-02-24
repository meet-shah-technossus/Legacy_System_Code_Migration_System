import { useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  HStack,
  Icon,
  IconButton,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverHeader,
  PopoverTrigger,
  Spinner,
  Text,
  Tooltip,
  useColorModeValue,
  VStack,
} from '@chakra-ui/react';
import { FiBell, FiCheckCircle, FiExternalLink } from 'react-icons/fi';
import { useRecentAuditLogs } from '../../hooks/useAudit';
import { timeAgo } from '../../utils/format';

// ─── Action colour ────────────────────────────────────────────────────────────

function actionColor(action: string): string {
  if (action === 'ERROR_OCCURRED' || action.includes('FAILED')) return 'red';
  if (action.startsWith('JOB_')) return 'blue';
  if (action === 'STATE_CHANGED') return 'purple';
  if (action.startsWith('YAML_')) return 'cyan';
  if (action.includes('REVIEW') || action.includes('REGENERAT')) return 'orange';
  if (action.startsWith('CODE_')) return 'teal';
  return 'gray';
}

const LAST_READ_KEY = 'notif_last_read';

function getLastReadAt(): number {
  const stored = localStorage.getItem(LAST_READ_KEY);
  return stored ? parseInt(stored, 10) : 0;
}

function markAllRead() {
  localStorage.setItem(LAST_READ_KEY, Date.now().toString());
}

// ─── Notification Bell ────────────────────────────────────────────────────────

export default function NotificationBell() {
  const navigate = useNavigate();
  const initRef = useRef<HTMLButtonElement>(null);
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const hoverBg = useColorModeValue('gray.50', 'gray.750');
  const headerBg = useColorModeValue('gray.50', 'gray.900');

  const { data, isLoading, isFetching } = useRecentAuditLogs(30);

  const lastReadAt = getLastReadAt();
  const logs = data?.logs ?? [];

  // Count events newer than last-read timestamp
  const unreadCount = logs.filter(
    (l) => new Date(l.created_at).getTime() > lastReadAt
  ).length;

  const handleMarkRead = useCallback(() => {
    markAllRead();
    // Force re-render by invalidating — we just call setState-less trick via
    // a no-op, React Query will refetch and component re-renders naturally.
    // Since getLastReadAt() is called on render the badge will clear.
    window.dispatchEvent(new Event('storage'));
  }, []);

  const handleOpen = useCallback(() => {
    // Snapshot unread as "read" when panel opens
    markAllRead();
  }, []);

  const top = logs.slice(0, 12);

  return (
    <Popover
      placement="bottom-end"
      initialFocusRef={initRef}
      onOpen={handleOpen}
      isLazy
    >
      <PopoverTrigger>
        <Box position="relative" display="inline-flex">
          <Tooltip label="Notifications" hasArrow>
            <IconButton
              aria-label="Notifications"
              icon={<FiBell />}
              variant="ghost"
              size="sm"
              isLoading={isFetching && !data}
            />
          </Tooltip>
          {unreadCount > 0 && (
            <Badge
              position="absolute"
              top="-1px"
              right="-1px"
              colorScheme="red"
              borderRadius="full"
              fontSize="9px"
              minW="16px"
              h="16px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              pointerEvents="none"
              zIndex={1}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Box>
      </PopoverTrigger>

      <PopoverContent
        bg={bg}
        borderColor={borderColor}
        boxShadow="xl"
        w="360px"
        maxH="480px"
        overflowY="auto"
      >
        <PopoverHeader
          bg={headerBg}
          borderBottomColor={borderColor}
          px={4}
          py={3}
          position="sticky"
          top={0}
          zIndex={1}
        >
          <Flex align="center" justify="space-between">
            <HStack spacing={2}>
              <Icon as={FiBell} boxSize={4} color="gray.400" />
              <Text fontSize="sm" fontWeight="semibold">Recent Activity</Text>
              {isFetching && <Spinner size="xs" color="gray.400" />}
            </HStack>
            <Button
              size="xs"
              variant="ghost"
              leftIcon={<FiCheckCircle />}
              onClick={handleMarkRead}
              color="gray.400"
              _hover={{ color: 'green.400' }}
            >
              Mark read
            </Button>
          </Flex>
        </PopoverHeader>

        <PopoverBody p={0}>
          {isLoading ? (
            <Flex justify="center" py={8}>
              <Spinner color="brand.400" />
            </Flex>
          ) : top.length === 0 ? (
            <Flex direction="column" align="center" py={8} gap={2}>
              <Icon as={FiBell} boxSize={8} color="gray.500" />
              <Text fontSize="sm" color="gray.400">No recent activity</Text>
            </Flex>
          ) : (
            <VStack spacing={0} align="stretch" divider={<Divider />}>
              {top.map((log) => {
                const color = actionColor(log.action);
                return (
                  <Flex
                    key={log.id}
                    px={4}
                    py={2.5}
                    gap={2.5}
                    align="flex-start"
                    _hover={{ bg: hoverBg }}
                    cursor={log.job_id != null ? 'pointer' : 'default'}
                    onClick={() => log.job_id != null && navigate(`/jobs/${log.job_id}`)}
                    transition="background 0.1s"
                  >
                    {/* Color dot */}
                    <Box
                      w={2}
                      h={2}
                      borderRadius="full"
                      bg={`${color}.400`}
                      mt={1.5}
                      flexShrink={0}
                    />

                    <VStack align="start" spacing={0.5} flex={1} minW={0}>
                      <HStack spacing={2} flexWrap="wrap">
                        <Badge
                          colorScheme={color}
                          variant="subtle"
                          fontSize="xs"
                          flexShrink={0}
                        >
                          {log.action.replace(/_/g, ' ')}
                        </Badge>
                        {log.job_id != null && (
                          <HStack spacing={0.5} flexShrink={0}>
                            <Text fontSize="xs" color="gray.400" fontFamily="mono">
                              #{log.job_id}
                            </Text>
                            <Icon as={FiExternalLink} boxSize={2.5} color="gray.500" />
                          </HStack>
                        )}
                      </HStack>

                      {log.performed_by && (
                        <Text fontSize="xs" color="gray.500">
                          by {log.performed_by}
                        </Text>
                      )}
                    </VStack>

                    <Text fontSize="xs" color="gray.500" flexShrink={0} mt={0.5}>
                      {timeAgo(log.created_at)}
                    </Text>
                  </Flex>
                );
              })}
            </VStack>
          )}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}
