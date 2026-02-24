import {
  Box,
  Flex,
  Icon,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Spinner,
  Text,
  Tooltip,
  VStack,
  Badge,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
} from '@chakra-ui/react';
import { useState, useMemo, useCallback } from 'react';
import {
  FiFile,
  FiFileText,
  FiFolder,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiTrash2,
  FiChevronRight,
  FiChevronDown,
  FiZap,
  FiCode,
} from 'react-icons/fi';
import type { ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ActivityBarTab } from './ActivityBar';
import { VS, useVSColors } from './vscodeTheme';
import { useJobs, useDeleteJob, useQueuedJobs, useCreateJob2 } from '../../hooks/useJobs';
import { useAuthStore } from '../../store/authStore';
import type { MigrationJobSummary, JobState, QueuedJob, TargetLanguage } from '../../types';
import { stateLabel, timeAgo } from '../../utils/format';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ExplorerPanelProps {
  activeTab: ActivityBarTab | null;
  selectedJobId: number | null;
  onSelectJob: (id: number) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATE_DOT: Record<JobState, string> = {
  CREATED:                    '#718096',
  YAML_GENERATED:             '#4299e1',
  UNDER_REVIEW:               '#ed8936',
  REGENERATE_REQUESTED:       '#ecc94b',
  APPROVED:                   '#48bb78',
  APPROVED_WITH_COMMENTS:     '#38a169',
  YAML_APPROVED_QUEUED:       '#76e4f7',
  CODE_GENERATED:             '#805ad5',
  CODE_UNDER_REVIEW:          '#9f7aea',
  CODE_REGENERATE_REQUESTED:  '#ed64a6',
  CODE_ACCEPTED:              '#48bb78',
  COMPLETED:                  '#38a169',
};

const LANG_EXT: Record<TargetLanguage, string> = {
  PYTHON:     '.py',
  TYPESCRIPT: '.ts',
  JAVASCRIPT: '.js',
  JAVA:       '.java',
  CSHARP:     '.cs',
};

const LANG_COLOR: Record<TargetLanguage, string> = {
  PYTHON:     '#3572A5',
  TYPESCRIPT: '#3178c6',
  JAVASCRIPT: '#f1e05a',
  JAVA:       '#b07219',
  CSHARP:     '#178600',
};

function fileLabel(job: MigrationJobSummary): string {
  const base = job.source_filename
    ? job.source_filename.replace(/\.[^.]+$/, '')
    : job.job_name ?? `job-${job.id}`;
  if (job.job_type === 'CODE_CONVERSION' && job.target_language) {
    return base + LANG_EXT[job.target_language];
  }
  return base + '.pick';
}

function fileColor(job: MigrationJobSummary): string {
  if (job.job_type === 'CODE_CONVERSION' && job.target_language) {
    return LANG_COLOR[job.target_language];
  }
  return '#d4d4d4';
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  isLoading?: boolean;
  onRefresh?: () => void;
  onNew?: () => void;
  newLabel?: string;
}

function SectionHeader({ title, isLoading, onRefresh, onNew, newLabel = 'New Job' }: SectionHeaderProps) {
  const colors = useVSColors();
  return (
    <Flex
      h="35px"
      align="center"
      justify="space-between"
      px={3}
      bg={colors.sectionHeader}
      borderBottom={`1px solid ${colors.sidebarBorder}`}
      flexShrink={0}
    >
      <Text fontSize="11px" fontWeight="600" color={colors.fgMuted} textTransform="uppercase" letterSpacing="0.08em">
        {title}
      </Text>
      <Flex align="center" gap={1}>
        {isLoading && <Spinner size="xs" color={colors.fgMuted} thickness="1.5px" />}
        {onRefresh && (
          <Tooltip label="Refresh" placement="bottom" hasArrow openDelay={600}>
            <IconButton
              aria-label="Refresh"
              icon={<Icon as={FiRefreshCw as ComponentType} boxSize="11px" />}
              size="xs"
              variant="ghost"
              color={colors.fgMuted}
              _hover={{ color: colors.fgActive, bg: colors.hover }}
              minW="20px" h="20px"
              onClick={onRefresh}
            />
          </Tooltip>
        )}
        {onNew && (
          <Tooltip label={newLabel} placement="bottom" hasArrow openDelay={600}>
            <IconButton
              aria-label={newLabel}
              icon={<Icon as={FiPlus as ComponentType} boxSize="13px" />}
              size="xs"
              variant="ghost"
              color={colors.fgMuted}
              _hover={{ color: colors.fgActive, bg: colors.hover }}
              minW="20px" h="20px"
              onClick={onNew}
            />
          </Tooltip>
        )}
      </Flex>
    </Flex>
  );
}

// ─── JobRow ───────────────────────────────────────────────────────────────────

interface JobRowProps {
  job: MigrationJobSummary;
  depth: number;                  // 0 = top level, 1 = child
  isSelected: boolean;
  hasChildren?: boolean;
  isCollapsed?: boolean;
  onSelect: () => void;
  onToggleCollapse?: () => void;
  onDelete: () => void;
}

function JobRow({
  job, depth, isSelected, hasChildren, isCollapsed, onSelect, onToggleCollapse, onDelete,
}: JobRowProps) {
  const colors = useVSColors();
  const [hovered, setHovered] = useState(false);
  const isFolder = job.job_type === 'YAML_CONVERSION';

  // Use same FiFolder icon; indicate open state with brighter color
  const FileIcon   = job.job_type === 'CODE_CONVERSION' ? FiCode : FiFileText;
  const RowIcon    = isFolder ? FiFolder : FileIcon;
  const folderColor = isFolder ? (isCollapsed ? '#c8924a' : '#e8c17a') : fileColor(job);

  return (
    <Flex
      align="center"
      h="22px"
      pl={`${8 + depth * 14}px`}
      pr={2}
      cursor="pointer"
      bg={isSelected ? colors.selected : hovered ? colors.hover : 'transparent'}
      color={isSelected ? colors.fgActive : colors.fg}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
      role="treeitem"
      aria-selected={isSelected}
      flexShrink={0}
      gap={1}
      userSelect="none"
    >
      {/* Collapse triangle — only for Job 1 rows with children */}
      <Box w="14px" flexShrink={0} display="flex" alignItems="center" justifyContent="center">
        {hasChildren ? (
          <Icon
            as={(isCollapsed ? FiChevronRight : FiChevronDown) as ComponentType}
            boxSize="10px"
            color={colors.fgMuted}
            onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(); }}
            _hover={{ color: colors.fgActive }}
          />
        ) : <Box w="10px" />}
      </Box>

      {/* File / folder icon */}
      <Icon
        as={RowIcon as ComponentType}
        boxSize="13px"
        color={isFolder ? folderColor : fileColor(job)}
        flexShrink={0}
      />

      {/* Filename */}
      <Text
        fontSize="13px"
        flex={1}
        overflow="hidden"
        textOverflow="ellipsis"
        whiteSpace="nowrap"
        lineHeight="22px"
      >
        {fileLabel(job)}
      </Text>

      {/* State dot */}
      <Box
        w="6px" h="6px"
        borderRadius="full"
        bg={STATE_DOT[job.current_state]}
        flexShrink={0}
        opacity={hovered || isSelected ? 1 : 0.7}
        title={stateLabel(job.current_state)}
      />

      {/* Delete button — only visible on hover */}
      {hovered && (
        <Tooltip label="Delete job" placement="top" hasArrow openDelay={300}>
          <IconButton
            aria-label="Delete job"
            icon={<Icon as={FiTrash2 as ComponentType} boxSize="10px" />}
            size="xs"
            variant="ghost"
            color={colors.fgMuted}
            _hover={{ color: '#fc8181', bg: 'transparent' }}
            minW="16px" h="16px"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          />
        </Tooltip>
      )}
    </Flex>
  );
}

// ─── QueuedJobRow ─────────────────────────────────────────────────────────────

interface QueuedJobRowProps {
  job: QueuedJob;
  isSelected: boolean;
  onSelect: () => void;
  onPickUp: () => void;
}

function QueuedJobRow({ job, isSelected, onSelect, onPickUp }: QueuedJobRowProps) {
  const colors = useVSColors();
  const [hovered, setHovered] = useState(false);

  return (
    <Flex
      direction="column"
      px={3}
      py="7px"
      cursor="pointer"
      bg={isSelected ? colors.selected : hovered ? colors.hover : 'transparent'}
      borderBottom={`1px solid ${colors.sidebarBorder}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
      userSelect="none"
      flexShrink={0}
    >
      <Flex align="center" justify="space-between" mb="3px">
        <Flex align="center" gap="6px" flex={1} overflow="hidden">
          <Icon as={FiFileText as ComponentType} boxSize="12px" color="#e8c17a" flexShrink={0} />
          <Text fontSize="12px" color={colors.fg} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
            {job.source_filename ?? job.job_name ?? `Job #${job.id}`}
          </Text>
        </Flex>
        <Badge
          fontSize="9px"
          px={1}
          py={0}
          bg="#007acc"
          color="white"
          borderRadius="3px"
          flexShrink={0}
          ml={2}
        >
          READY
        </Badge>
      </Flex>
      <Flex align="center" justify="space-between">
        <Text fontSize="11px" color={colors.fgMuted}>{timeAgo(job.updated_at)}</Text>
        {hovered && (
          <Flex
            align="center"
            gap="4px"
            px="8px"
            h="18px"
            bg={colors.activityIndicator}
            borderRadius="3px"
            cursor="pointer"
            onClick={(e) => { e.stopPropagation(); onPickUp(); }}
            _hover={{ bg: colors.selectedHover }}
          >
            <Icon as={FiZap as ComponentType} boxSize="9px" color="white" />
            <Text fontSize="10px" color="white" fontWeight="600">Pick Up</Text>
          </Flex>
        )}
      </Flex>
    </Flex>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  const colors = useVSColors();
  return (
    <VStack flex={1} justify="center" align="center" spacing={3} px={4} opacity={0.45}>
      <Icon as={FiFile as ComponentType} boxSize={7} color={colors.fgMuted} />
      <Text fontSize="12px" color={colors.fgMuted} textAlign="center">{message}</Text>
      {actionLabel && onAction && (
        <Flex
          align="center"
          px={3} py={1}
          bg={colors.activityIndicator}
          borderRadius="4px"
          cursor="pointer"
          onClick={onAction}
          _hover={{ bg: colors.selectedHover }}
        >
          <Text fontSize="11px" color="white" fontWeight="600">{actionLabel}</Text>
        </Flex>
      )}
    </VStack>
  );
}

// ─── ExplorerView ─────────────────────────────────────────────────────────────

interface ExplorerViewProps {
  selectedJobId: number | null;
  onSelectJob: (id: number) => void;
}

function ExplorerView({ selectedJobId, onSelectJob }: ExplorerViewProps) {
  const colors = useVSColors();
  const navigate = useNavigate();
  const { data: jobs = [], isLoading, refetch } = useJobs({ limit: 200 });
  const { mutate: deleteJob } = useDeleteJob();
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [quickFilter, setQuickFilter] = useState('');

  const toggleCollapse = useCallback((id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Split into Job 1s and Job 2s
  const { job1s, childrenByParent } = useMemo(() => {
    const j1s = jobs.filter((j) => j.job_type === 'YAML_CONVERSION');
    const j2s = jobs.filter((j) => j.job_type === 'CODE_CONVERSION');
    const map = new Map<number, MigrationJobSummary[]>();
    j2s.forEach((j) => {
      if (j.parent_job_id != null) {
        const arr = map.get(j.parent_job_id) ?? [];
        arr.push(j);
        map.set(j.parent_job_id, arr);
      }
    });
    // Orphan Job 2s (no parent in list) — treat as top-level
    const orphanJ2s = j2s.filter((j) => j.parent_job_id == null || !j1s.find((p) => p.id === j.parent_job_id));
    return { job1s: [...j1s, ...orphanJ2s], childrenByParent: map };
  }, [jobs]);

  // Apply quick filter
  const filtered = useMemo(() => {
    const q = quickFilter.trim().toLowerCase();
    if (!q) return job1s;
    return jobs.filter(
      (j) =>
        (j.job_name ?? '').toLowerCase().includes(q) ||
        (j.source_filename ?? '').toLowerCase().includes(q) ||
        j.current_state.toLowerCase().includes(q),
    );
  }, [job1s, jobs, quickFilter]);

  const rows: Array<{ job: MigrationJobSummary; depth: number }> = useMemo(() => {
    if (quickFilter.trim()) return filtered.map((job) => ({ job, depth: 0 }));
    const result: Array<{ job: MigrationJobSummary; depth: number }> = [];
    filtered.forEach((job) => {
      result.push({ job, depth: 0 });
      if (!collapsed.has(job.id)) {
        const children = childrenByParent.get(job.id) ?? [];
        children.forEach((child) => result.push({ job: child, depth: 1 }));
      }
    });
    return result;
  }, [filtered, collapsed, childrenByParent, quickFilter]);

  return (
    <>
      <SectionHeader
        title="Explorer"
        isLoading={isLoading}
        onRefresh={() => refetch()}
        onNew={() => navigate('/jobs/new')}
      />

      {/* Quick-filter input */}
      <Box px={2} py="5px" flexShrink={0} borderBottom={`1px solid ${colors.sidebarBorder}`}>
        <InputGroup size="xs">
          <InputLeftElement pointerEvents="none">
            <Icon as={FiSearch as ComponentType} boxSize="10px" color={colors.fgMuted} />
          </InputLeftElement>
          <Input
            placeholder="Filter…"
            value={quickFilter}
            onChange={(e) => setQuickFilter(e.target.value)}
            bg={colors.input}
            border={`1px solid ${colors.inputBorder}`}
            borderRadius="3px"
            color={colors.fg}
            fontSize="12px"
            h="22px"
            pl={6}
            _placeholder={{ color: colors.fgMuted }}
            _focus={{ borderColor: colors.activityIndicator, boxShadow: 'none' }}
          />
        </InputGroup>
      </Box>

      {/* Job tree */}
      <Box flex={1} overflowY="auto" overflowX="hidden"
        css={{
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-thumb': { background: colors.scrollbar, borderRadius: '3px' },
          '&::-webkit-scrollbar-thumb:hover': { background: colors.scrollbarHover },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
        }}
      >
        {isLoading ? (
          <Flex justify="center" align="center" h="80px">
            <Spinner size="sm" color={colors.fgMuted} />
          </Flex>
        ) : rows.length === 0 ? (
          <EmptyState
            message={quickFilter ? 'No jobs match your filter' : 'No jobs yet'}
            actionLabel={quickFilter ? undefined : 'Create a job'}
            onAction={quickFilter ? undefined : () => navigate('/jobs/new')}
          />
        ) : (
          rows.map(({ job, depth }) => {
            const children = childrenByParent.get(job.id) ?? [];
            return (
              <JobRow
                key={job.id}
                job={job}
                depth={depth}
                isSelected={selectedJobId === job.id}
                hasChildren={children.length > 0 && !quickFilter}
                isCollapsed={collapsed.has(job.id)}
                onSelect={() => onSelectJob(job.id)}
                onToggleCollapse={() => toggleCollapse(job.id)}
                onDelete={() => deleteJob(job.id)}
              />
            );
          })
        )}
      </Box>
    </>
  );
}

// ─── SearchView ───────────────────────────────────────────────────────────────

interface SearchViewProps {
  selectedJobId: number | null;
  onSelectJob: (id: number) => void;
}

function SearchView({ selectedJobId, onSelectJob }: SearchViewProps) {
  const colors = useVSColors();
  const [query, setQuery] = useState('');
  const { data: jobs = [], isLoading } = useJobs({ limit: 200 });
  const { mutate: deleteJob } = useDeleteJob();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return jobs.filter(
      (j) =>
        (j.job_name ?? '').toLowerCase().includes(q) ||
        (j.source_filename ?? '').toLowerCase().includes(q) ||
        j.current_state.toLowerCase().includes(q),
    );
  }, [jobs, query]);

  return (
    <>
      <SectionHeader title="Search" isLoading={isLoading && !!query} />

      <Box px={2} py="6px" flexShrink={0}>
        <InputGroup size="sm">
          <InputLeftElement pointerEvents="none" h="28px">
            <Icon as={FiSearch as ComponentType} boxSize="11px" color={colors.fgMuted} />
          </InputLeftElement>
          <Input
            autoFocus
            placeholder="Search jobs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            bg={colors.input}
            border={`1px solid ${colors.inputBorder}`}
            borderRadius="3px"
            color={colors.fg}
            fontSize="12px"
            h="28px"
            _placeholder={{ color: colors.fgMuted }}
            _focus={{ borderColor: colors.activityIndicator, boxShadow: 'none' }}
          />
        </InputGroup>
      </Box>

      {query && (
        <Text fontSize="10px" color={colors.fgMuted} px={3} pb="4px" flexShrink={0}>
          {results.length} result{results.length !== 1 ? 's' : ''}
        </Text>
      )}

      <Box flex={1} overflowY="auto"
        css={{
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-thumb': { background: colors.scrollbar, borderRadius: '3px' },
        }}
      >
        {!query ? (
          <EmptyState message="Type to search jobs by name, filename or state" />
        ) : results.length === 0 ? (
          <EmptyState message={`No results for "${query}"`} />
        ) : (
          results.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              depth={0}
              isSelected={selectedJobId === job.id}
              onSelect={() => onSelectJob(job.id)}
              onDelete={() => deleteJob(job.id)}
            />
          ))
        )}
      </Box>
    </>
  );
}

// ─── QueueView ────────────────────────────────────────────────────────────────

const LANG_LABELS: Record<TargetLanguage, string> = {
  PYTHON:     'Python',
  TYPESCRIPT: 'TypeScript',
  JAVASCRIPT: 'JavaScript',
  JAVA:       'Java',
  CSHARP:     'C#',
};

interface QueueViewProps {
  selectedJobId: number | null;
  onSelectJob: (id: number) => void;
}

function QueueView({ selectedJobId, onSelectJob }: QueueViewProps) {
  const colors = useVSColors();
  const { user } = useAuthStore();
  const { data: queued = [], isLoading, refetch } = useQueuedJobs();
  const createJob2 = useCreateJob2();

  const [pickedJob,  setPickedJob]  = useState<QueuedJob | null>(null);
  const [targetLang, setTargetLang] = useState<TargetLanguage>('PYTHON');
  const [jobName,    setJobName]    = useState('');

  const openModal = (job: QueuedJob) => {
    setPickedJob(job);
    setTargetLang('PYTHON');
    setJobName('');
  };

  const closeModal = () => setPickedJob(null);

  const handleCreate = () => {
    if (!pickedJob) return;
    createJob2.mutate(
      {
        parent_job_id: pickedJob.id,
        target_language: targetLang,
        ...(jobName.trim() ? { job_name: jobName.trim() } : {}),
        created_by: user?.username ?? 'system',
      },
      {
        onSuccess: (newJob) => {
          closeModal();
          refetch();
          onSelectJob(newJob.id);
        },
      }
    );
  };

  return (
    <>
      <SectionHeader
        title="Queue"
        isLoading={isLoading}
        onRefresh={() => refetch()}
      />

      {/* Stats strip */}
      {queued.length > 0 && (
        <Flex
          px={3} py="5px"
          align="center"
          gap={2}
          borderBottom={`1px solid ${colors.sidebarBorder}`}
          flexShrink={0}
        >
          <Box w="6px" h="6px" borderRadius="full" bg="#76e4f7" />
          <Text fontSize="11px" color={colors.fgMuted}>
            {queued.length} job{queued.length !== 1 ? 's' : ''} awaiting code conversion
          </Text>
        </Flex>
      )}

      <Box flex={1} overflowY="auto"
        css={{
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-thumb': { background: colors.scrollbar, borderRadius: '3px' },
        }}
      >
        {isLoading ? (
          <Flex justify="center" align="center" h="80px">
            <Spinner size="sm" color={colors.fgMuted} />
          </Flex>
        ) : queued.length === 0 ? (
          <EmptyState message="No jobs in the queue" />
        ) : (
          queued.map((job) => (
            <QueuedJobRow
              key={job.id}
              job={job}
              isSelected={selectedJobId === job.id}
              onSelect={() => onSelectJob(job.id)}
              onPickUp={() => openModal(job)}
            />
          ))
        )}
      </Box>

      {/* ── Job 2 creation modal ─────────────────────────────── */}
      <Modal isOpen={pickedJob != null} onClose={closeModal} size="sm" isCentered>
        <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(4px)" />
        <ModalContent bg={colors.panel} border={`1px solid ${colors.panelBorder}`} borderRadius="8px">
          <ModalHeader fontSize="13px" fontWeight="semibold" color={colors.fgActive} pb={2}>
            Create Job 2 — Code Conversion
          </ModalHeader>
          <ModalCloseButton color={colors.fgMuted} />
          <ModalBody pb={4}>
            {/* Source job info */}
            <Box
              px={3} py="8px"
              bg={colors.sectionHeader}
              borderRadius="4px"
              border={`1px solid ${colors.panelBorder}`}
              mb={4}
            >
              <Text fontSize="10px" color={colors.fgMuted} mb="2px" textTransform="uppercase" letterSpacing="0.06em">Source (Job 1)</Text>
              <Text fontSize="12px" color={colors.fg}>
                {pickedJob?.source_filename ?? pickedJob?.job_name ?? `Job #${pickedJob?.id}`}
              </Text>
            </Box>

            {/* Target language selector */}
            <Text fontSize="11px" color={colors.fgMuted} mb={2} fontWeight="medium">
              Target Language
            </Text>
            <Flex wrap="wrap" gap={2} mb={4}>
              {(Object.keys(LANG_LABELS) as TargetLanguage[]).map(lang => (
                <Flex
                  key={lang}
                  as="button"
                  align="center"
                  gap={2}
                  px="10px" py="5px"
                  borderRadius="4px"
                  border={`1px solid ${targetLang === lang ? colors.activityIndicator : colors.inputBorder}`}
                  bg={targetLang === lang ? 'rgba(0,122,204,0.2)' : colors.input}
                  color={targetLang === lang ? '#66b3e8' : colors.fg}
                  fontSize="12px"
                  cursor="pointer"
                  onClick={() => setTargetLang(lang)}
                  userSelect="none"
                  _hover={{ borderColor: colors.activityIndicator }}
                  transition="all 0.12s"
                >
                  <Box
                    w="8px" h="8px" borderRadius="full"
                    bg={targetLang === lang ? LANG_COLOR[lang] : colors.fgMuted}
                    flexShrink={0}
                  />
                  {LANG_LABELS[lang]}
                </Flex>
              ))}
            </Flex>

            {/* Optional job name */}
            <Text fontSize="11px" color={colors.fgMuted} mb={1} fontWeight="medium">
              Job Name <Text as="span" fontWeight="normal" opacity={0.5}>(optional)</Text>
            </Text>
            <Input
              value={jobName}
              onChange={e => setJobName(e.target.value)}
              placeholder={pickedJob?.source_filename ?? 'Leave blank to auto-generate'}
              bg={colors.input}
              border={`1px solid ${colors.inputBorder}`}
              borderRadius="4px"
              color={colors.fg}
              fontSize="12px"
              h="30px"
              _placeholder={{ color: colors.fgMuted, opacity: 0.45 }}
              _focus={{ borderColor: '#007acc', boxShadow: '0 0 0 1px #007acc' }}
            />
          </ModalBody>
          <ModalFooter gap={2} pt={0}>
            <Button
              size="sm" variant="ghost"
              color={colors.fgMuted}
              onClick={closeModal}
              fontSize="12px"
            >
              Cancel
            </Button>
            <Button
              size="sm" colorScheme="blue"
              onClick={handleCreate}
              isLoading={createJob2.isPending}
              fontSize="12px"
              leftIcon={<Icon as={FiZap as ComponentType} boxSize="11px" />}
            >
              Create &amp; Open
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

// ─── ExplorerPanel (main export) ──────────────────────────────────────────────

/**
 * VS Code Explorer sidebar — switches between Explorer / Search / Queue views
 * based on the active Activity Bar tab.
 */
export default function ExplorerPanel({ activeTab, selectedJobId, onSelectJob }: ExplorerPanelProps) {
  const colors = useVSColors();
  return (
    <Flex direction="column" h="100%" overflow="hidden" bg={colors.sidebar}>
      {activeTab === 'queue' ? (
        <QueueView selectedJobId={selectedJobId} onSelectJob={onSelectJob} />
      ) : activeTab === 'search' ? (
        <SearchView selectedJobId={selectedJobId} onSelectJob={onSelectJob} />
      ) : (
        // Default: 'explorer' or null
        <ExplorerView selectedJobId={selectedJobId} onSelectJob={onSelectJob} />
      )}
    </Flex>
  );
}
