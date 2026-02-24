import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
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
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  Badge,
  Tooltip,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  useDisclosure,
  useColorModeValue,
  VStack,
  Tag,
} from '@chakra-ui/react';
import {
  FiPlus,
  FiSearch,
  FiRefreshCw,
  FiTrash2,
  FiEye,
  FiChevronLeft,
  FiChevronRight,
  FiCode,
  FiFilter,
  FiZap,
} from 'react-icons/fi';
import { useRef } from 'react';
import { useJobs, useDeleteJob } from '../hooks/useJobs';
import { stateLabel, stateColorScheme, languageLabel, timeAgo, formatDateTime } from '../utils/format';
import { usePrefsStore } from '../store/prefsStore';
import type { JobState, TargetLanguage, MigrationJobSummary } from '../types';

const JOB_STATES: JobState[] = [
  'CREATED',
  'YAML_GENERATED',
  'UNDER_REVIEW',
  'REGENERATE_REQUESTED',
  'APPROVED',
  'APPROVED_WITH_COMMENTS',
  'YAML_APPROVED_QUEUED',
  'CODE_GENERATED',
  'CODE_UNDER_REVIEW',
  'CODE_REGENERATE_REQUESTED',
  'CODE_ACCEPTED',
  'COMPLETED',
];

const LANGUAGES: TargetLanguage[] = ['PYTHON', 'TYPESCRIPT', 'JAVASCRIPT', 'JAVA', 'CSHARP'];

export default function JobsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [stateFilter, setStateFilter] = useState<JobState | ''>('');
  const [langFilter, setLangFilter] = useState<TargetLanguage | ''>('');
  const [search, setSearch] = useState('');
  const [jobToDelete, setJobToDelete] = useState<MigrationJobSummary | null>(null);
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();
  const cancelRef = useRef<HTMLButtonElement>(null);

  const pageSize = usePrefsStore((s) => s.jobsPageSize);
  const useAbsoluteTimestamps = usePrefsStore((s) => s.useAbsoluteTimestamps);

  const { data: jobs, isLoading, isFetching, refetch } = useJobs({
    skip: page * pageSize,
    limit: pageSize,
    ...(stateFilter ? { state: stateFilter } : {}),
    ...(langFilter ? { target_language: langFilter } : {}),
  });

  const deleteMutation = useDeleteJob();

  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const rowHover = useColorModeValue('gray.50', 'gray.750');
  const headerBg = useColorModeValue('gray.50', 'gray.900');

  // Client-side name filter applied on top of server results
  const filtered = (jobs ?? []).filter((j) => {
    if (!search) return true;
    const term = search.toLowerCase();
    const name = (j.job_name ?? `Job #${j.id}`).toLowerCase();
    const file = (j.source_filename ?? '').toLowerCase();
    return name.includes(term) || file.includes(term);
  });

  const handleDeleteClick = useCallback((e: React.MouseEvent, job: MigrationJobSummary) => {
    e.stopPropagation();
    setJobToDelete(job);
    onDeleteOpen();
  }, [onDeleteOpen]);

  const handleDeleteConfirm = () => {
    if (!jobToDelete) return;
    deleteMutation.mutate(jobToDelete.id, {
      onSuccess: () => { onDeleteClose(); setJobToDelete(null); },
    });
  };

  const handleFilterChange = () => {
    setPage(0); // reset to first page when filters change
  };

  const canPrev = page > 0;
  const canNext = (jobs ?? []).length === pageSize;

  return (
    <Container maxW="full" py={6} px={{ base: 4, md: 8 }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <Flex align="center" justify="space-between" mb={6} gap={4} flexWrap="wrap">
        <HStack spacing={3}>
          <Icon as={FiCode} boxSize={6} color="brand.400" />
          <Heading size="lg">Migration Jobs</Heading>
        </HStack>
        <Button
          leftIcon={<FiPlus />}
          colorScheme="brand"
          onClick={() => navigate('/jobs/new')}
        >
          New Migration Job
        </Button>
      </Flex>

      {/* ── Filters ─────────────────────────────────────────── */}
      <Box
        bg={bg}
        border="1px solid"
        borderColor={borderColor}
        borderRadius="lg"
        p={4}
        mb={4}
      >
        <Flex gap={3} flexWrap="wrap" align="center">
          <Icon as={FiFilter} color="gray.400" />
          <InputGroup maxW="280px">
            <InputLeftElement pointerEvents="none">
              <Icon as={FiSearch} color="gray.400" />
            </InputLeftElement>
            <Input
              placeholder="Search by name or file…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="sm"
            />
          </InputGroup>

          <Select
            placeholder="All States"
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value as JobState | '');
              handleFilterChange();
            }}
            size="sm"
            maxW="200px"
          >
            {JOB_STATES.map((s) => (
              <option key={s} value={s}>{stateLabel(s)}</option>
            ))}
          </Select>

          <Select
            placeholder="All Languages"
            value={langFilter}
            onChange={(e) => {
              setLangFilter(e.target.value as TargetLanguage | '');
              handleFilterChange();
            }}
            size="sm"
            maxW="180px"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{languageLabel(l)}</option>
            ))}
          </Select>

          <Tooltip label="Refresh">
            <IconButton
              aria-label="Refresh jobs"
              icon={<FiRefreshCw />}
              size="sm"
              variant="ghost"
              isLoading={isFetching}
              onClick={() => refetch()}
            />
          </Tooltip>

          {(stateFilter || langFilter || search) && (
            <Button
              size="sm"
              variant="ghost"
              colorScheme="red"
              onClick={() => {
                setStateFilter('');
                setLangFilter('');
                setSearch('');
                setPage(0);
              }}
            >
              Clear filters
            </Button>
          )}
        </Flex>
      </Box>

      {/* ── Table ───────────────────────────────────────────── */}
      <Box
        bg={bg}
        border="1px solid"
        borderColor={borderColor}
        borderRadius="lg"
        overflow="hidden"
      >
        {isLoading ? (
          <Flex justify="center" align="center" py={20}>
            <Spinner size="xl" color="brand.400" />
          </Flex>
        ) : filtered.length === 0 ? (
          <VStack py={20} spacing={4}>
            <Icon as={FiCode} boxSize={12} color="gray.500" />
            <Text fontSize="lg" color="gray.400">No migration jobs found</Text>
            <Text color="gray.500" fontSize="sm">
              {stateFilter || langFilter || search
                ? 'Try adjusting your filters'
                : 'Create your first migration job to get started'}
            </Text>
            {!stateFilter && !langFilter && !search && (
              <Button
                leftIcon={<FiPlus />}
                colorScheme="brand"
                mt={2}
                onClick={() => navigate('/jobs/new')}
              >
                New Migration Job
              </Button>
            )}
          </VStack>
        ) : (
          <Table variant="simple" size="sm">
            <Thead bg={headerBg}>
              <Tr>
                <Th>ID</Th>
                <Th>Job Name</Th>
                <Th>Type</Th>
                <Th>Language</Th>
                <Th>State</Th>
                <Th>Source File</Th>
                <Th>Created</Th>
                <Th>Updated</Th>
                <Th width="100px">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filtered.map((job) => (
                <Tr
                  key={job.id}
                  cursor="pointer"
                  _hover={{ bg: rowHover }}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  transition="background 0.15s"
                >
                  <Td>
                    <Tag size="sm" colorScheme="gray" fontFamily="mono">
                      #{job.id}
                    </Tag>
                  </Td>
                  <Td maxW="220px">
                    <Text fontWeight="medium" noOfLines={1}>
                      {job.job_name ?? <Text as="span" color="gray.500" fontStyle="italic">Untitled</Text>}
                    </Text>
                  </Td>
                  <Td>
                    <Badge
                      colorScheme={job.job_type === 'CODE_CONVERSION' ? 'purple' : 'blue'}
                      variant="outline"
                      fontSize="xs"
                    >
                      {job.job_type === 'CODE_CONVERSION' ? 'Job 2' : 'Job 1'}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge colorScheme="purple" variant="subtle" fontSize="xs">
                      {job.target_language ? languageLabel(job.target_language) : <Text as="span" color="gray.400" fontStyle="italic">—</Text>}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge
                      colorScheme={stateColorScheme(job.current_state)}
                      variant="subtle"
                      fontSize="xs"
                    >
                      {stateLabel(job.current_state)}
                    </Badge>
                  </Td>
                  <Td maxW="180px">
                    <Text fontSize="xs" color="gray.400" noOfLines={1} fontFamily="mono">
                      {job.source_filename ?? '—'}
                    </Text>
                  </Td>
                  <Td>
                    <Tooltip label={formatDateTime(job.created_at)} hasArrow>
                      <Text fontSize="xs" color="gray.400">
                        {useAbsoluteTimestamps ? formatDateTime(job.created_at) : timeAgo(job.created_at)}
                      </Text>
                    </Tooltip>
                  </Td>
                  <Td>
                    <Tooltip label={formatDateTime(job.updated_at)} hasArrow>
                      <Text fontSize="xs" color="gray.400">
                        {useAbsoluteTimestamps ? formatDateTime(job.updated_at) : timeAgo(job.updated_at)}
                      </Text>
                    </Tooltip>
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <HStack spacing={1}>
                      {job.current_state === 'YAML_APPROVED_QUEUED' && (
                        <Tooltip label="Open in Studio" hasArrow>
                          <IconButton
                            aria-label="Open in Studio"
                            icon={<FiZap />}
                            size="xs"
                            variant="ghost"
                            colorScheme="teal"
                            onClick={() => navigate('/')}
                            data-testid="studio-btn"
                          />
                        </Tooltip>
                      )}
                      <Tooltip label="View details" hasArrow>
                        <IconButton
                          aria-label="View job"
                          icon={<FiEye />}
                          size="xs"
                          variant="ghost"
                          colorScheme="brand"
                          onClick={() => navigate(`/jobs/${job.id}`)}
                        />
                      </Tooltip>
                      <Tooltip label="Delete job" hasArrow>
                        <IconButton
                          aria-label="Delete job"
                          icon={<FiTrash2 />}
                          size="xs"
                          variant="ghost"
                          colorScheme="red"
                          onClick={(e) => handleDeleteClick(e, job)}
                        />
                      </Tooltip>
                    </HStack>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Box>

      {/* ── Pagination ──────────────────────────────────────── */}
      {!isLoading && (jobs ?? []).length > 0 && (
        <Flex justify="space-between" align="center" mt={4}>
          <Text fontSize="sm" color="gray.400">
            Showing {page * pageSize + 1}–{page * pageSize + filtered.length} jobs
          </Text>
          <HStack>
            <IconButton
              aria-label="Previous page"
              icon={<FiChevronLeft />}
              size="sm"
              variant="ghost"
              isDisabled={!canPrev}
              onClick={() => setPage((p) => p - 1)}
            />
            <Text fontSize="sm" color="gray.400">Page {page + 1}</Text>
            <IconButton
              aria-label="Next page"
              icon={<FiChevronRight />}
              size="sm"
              variant="ghost"
              isDisabled={!canNext}
              onClick={() => setPage((p) => p + 1)}
            />
          </HStack>
        </Flex>
      )}

      {/* ── Delete confirmation dialog ───────────────────────── */}
      <AlertDialog
        isOpen={isDeleteOpen}
        leastDestructiveRef={cancelRef}
        onClose={onDeleteClose}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Delete Migration Job
            </AlertDialogHeader>
            <AlertDialogBody>
              Are you sure you want to delete{' '}
              <Text as="span" fontWeight="bold">
                {jobToDelete?.job_name ?? `Job #${jobToDelete?.id}`}
              </Text>
              ? This action cannot be undone and all associated YAML versions, code, and reviews will be permanently removed.
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={onDeleteClose} variant="ghost">
                Cancel
              </Button>
              <Button
                colorScheme="red"
                ml={3}
                onClick={handleDeleteConfirm}
                isLoading={deleteMutation.isPending}
              >
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Container>
  );
}
