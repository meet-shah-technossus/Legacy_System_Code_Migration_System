import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  Flex,
  Grid,
  GridItem,
  Heading,
  HStack,
  Icon,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Skeleton,
  SkeletonText,
  Spinner,
  Stat,
  StatLabel,
  StatNumber,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Textarea,
  Tooltip,
  useColorModeValue,
  useDisclosure,
  VStack,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Code,
  FormControl,
  FormLabel,
  Input,
  Select,
  Switch,
  useToast,
} from '@chakra-ui/react';
import {
  FiArrowLeft,
  FiCheck,
  FiChevronDown,
  FiCode,
  FiCopy,
  FiDownload,
  FiFileText,
  FiRefreshCw,
  FiTerminal,
  FiTrash2,
  FiZap,
} from 'react-icons/fi';
import { useRef } from 'react';
import toast from 'react-hot-toast';

import { useJob, useJobWithSource, useAllowedTransitions, useTransitionJob, useDeleteJob } from '../hooks/useJobs';
import { useYAMLVersions, useGenerateYAML, useApproveYAML, useRegenerateYAML } from '../hooks/useYaml';
import { useGeneratedCode, useGenerateCode, useCodeHistory, useCodeVersions, useCodeVersion, useRestoreCodeVersion } from '../hooks/useCode';
import { yamlApi } from '../services/yamlApi';
import { codeApi } from '../services/codeApi';
import { usePrefsStore } from '../store/prefsStore';
import { stateLabel, stateColorScheme, languageLabel, formatDateTime, formatDate, timeAgo, formatDuration } from '../utils/format';
import { useAuthStore } from '../store/authStore';
import type { JobState, YAMLVersionSummary, TargetLanguage, JobType } from '../types';
import GenerationProcessingOverlay from '../components/vscode/GenerationProcessingOverlay';

// ─── Workflow Steps ───────────────────────────────────────────────────────────

// Job 1 (YAML_CONVERSION): Pick Basic → YAML spec pipeline
const JOB1_STEPS: { state: JobState; label: string }[] = [
  { state: 'CREATED', label: 'Created' },
  { state: 'YAML_GENERATED', label: 'YAML Ready' },
  { state: 'UNDER_REVIEW', label: 'Under Review' },
  { state: 'APPROVED', label: 'Approved' },
  { state: 'YAML_APPROVED_QUEUED', label: 'Queued' },
];

const JOB1_STATE_STEP: Partial<Record<JobState, number>> = {
  CREATED: 0,
  YAML_GENERATED: 1,
  UNDER_REVIEW: 2,
  REGENERATE_REQUESTED: 2,
  APPROVED: 3,
  APPROVED_WITH_COMMENTS: 3,
  YAML_APPROVED_QUEUED: 4,
};

// Job 2 (CODE_CONVERSION): YAML → target language code pipeline
const JOB2_STEPS: { state: JobState; label: string }[] = [
  { state: 'CREATED', label: 'Created' },
  { state: 'CODE_GENERATED', label: 'Code Ready' },
  { state: 'CODE_UNDER_REVIEW', label: 'Under Review' },
  { state: 'CODE_ACCEPTED', label: 'Accepted' },
  { state: 'COMPLETED', label: 'Completed' },
];

const JOB2_STATE_STEP: Partial<Record<JobState, number>> = {
  CREATED: 0,
  CODE_GENERATED: 1,
  CODE_UNDER_REVIEW: 2,
  CODE_REGENERATE_REQUESTED: 2,
  CODE_ACCEPTED: 3,
  COMPLETED: 4,
};

function WorkflowStepper({ currentState, jobType }: { currentState: JobState; jobType: JobType }) {
  const steps = jobType === 'CODE_CONVERSION' ? JOB2_STEPS : JOB1_STEPS;
  const stateStep = jobType === 'CODE_CONVERSION' ? JOB2_STATE_STEP : JOB1_STATE_STEP;
  const activeStep = stateStep[currentState] ?? 0;
  const trackBg = useColorModeValue('gray.200', 'gray.700');
  const doneBg = 'brand.400';
  const circleBorder = useColorModeValue('gray.300', 'gray.600');

  const isRegenState = currentState === 'REGENERATE_REQUESTED' || currentState === 'CODE_REGENERATE_REQUESTED';

  return (
    <Flex align="center" w="full" gap={0}>
      {steps.map((step, idx) => {
        const isDone = idx < activeStep;
        const isActive = idx === activeStep;
        const isRegen = isRegenState && isActive;
        return (
          <Flex key={step.state} align="center" flex={idx < steps.length - 1 ? 1 : 'none'}>
            <VStack spacing={1} minW="52px">
              <Box
                w={7}
                h={7}
                borderRadius="full"
                border="2px solid"
                borderColor={isActive || isDone ? 'brand.400' : circleBorder}
                bg={isDone ? 'brand.400' : isActive ? 'brand.900' : 'transparent'}
                display="flex"
                alignItems="center"
                justifyContent="center"
                position="relative"
              >
                {isDone ? (
                  <Icon as={FiCheck} boxSize={3} color="white" />
                ) : (
                  <Box
                    w={2}
                    h={2}
                    borderRadius="full"
                    bg={isActive ? 'brand.400' : 'transparent'}
                  />
                )}
                {isRegen && (
                  <Icon
                    as={FiRefreshCw}
                    boxSize={3}
                    color="yellow.400"
                    position="absolute"
                    top="-6px"
                    right="-6px"
                  />
                )}
              </Box>
              <Text
                fontSize="xs"
                color={isActive ? 'brand.300' : isDone ? 'gray.400' : 'gray.500'}
                fontWeight={isActive ? 'bold' : 'normal'}
                textAlign="center"
                lineHeight="1.2"
                whiteSpace="nowrap"
              >
                {isRegen ? 'Regen…' : step.label}
              </Text>
            </VStack>
            {idx < steps.length - 1 && (
              <Box flex={1} h="2px" bg={isDone ? doneBg : trackBg} mx={1} mb={5} />
            )}
          </Flex>
        );
      })}
    </Flex>
  );
}

// ─── Source Code Viewer ───────────────────────────────────────────────────────

function SourceCodePanel({ jobId }: { jobId: number }) {
  const { data, isLoading } = useJobWithSource(jobId);
  const codeBg = useColorModeValue('gray.50', 'gray.900');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  const handleCopy = () => {
    if (data?.original_source_code) {
      navigator.clipboard.writeText(data.original_source_code);
      toast.success('Copied to clipboard');
    }
  };

  if (isLoading) return <SkeletonText noOfLines={20} spacing={3} />;

  return (
    <Box position="relative">
      <Flex justify="space-between" align="center" mb={3}>
        <HStack spacing={2}>
          <Icon as={FiFileText} color="gray.400" />
          <Text fontSize="sm" fontWeight="medium" color="gray.400">
            {data?.source_filename ?? 'Source Code'}
          </Text>
          {data?.original_source_code && (
            <Text fontSize="xs" color="gray.500">
              · {data.original_source_code.split('\n').length} lines ·{' '}
              {data.original_source_code.length.toLocaleString()} chars
            </Text>
          )}
        </HStack>
        <Tooltip label="Copy source code" hasArrow>
          <IconButton
            aria-label="Copy"
            icon={<FiCopy />}
            size="xs"
            variant="ghost"
            onClick={handleCopy}
          />
        </Tooltip>
      </Flex>
      <Box
        as="pre"
        bg={codeBg}
        border="1px solid"
        borderColor={borderColor}
        borderRadius="lg"
        p={4}
        fontSize="xs"
        fontFamily="mono"
        overflowX="auto"
        whiteSpace="pre-wrap"
        wordBreak="break-all"
        maxH="600px"
        overflowY="auto"
        lineHeight={1.7}
      >
        {data?.original_source_code ?? '—'}
      </Box>
    </Box>
  );
}

// ─── YAML Versions Panel ──────────────────────────────────────────────────────

function YamlVersionsPanel({ jobId, currentState }: { jobId: number; currentState: JobState }) {
  const { data: versions, isLoading } = useYAMLVersions(jobId, true);
  const user = useAuthStore((s) => s.user);
  const username = user?.username ?? 'system';
  const useAbsoluteTimestamps = usePrefsStore((s) => s.useAbsoluteTimestamps);

  const generateYAML = useGenerateYAML(jobId);
  const regenerateYAML = useRegenerateYAML(jobId);

  const [selectedVersion, setSelectedVersion] = useState<YAMLVersionSummary | null>(null);
  const [yamlContent, setYamlContent] = useState<string>('');
  const { isOpen: isApproveOpen, onOpen: onApproveOpen, onClose: onApproveClose } = useDisclosure();
  const [approveComments, setApproveComments] = useState('');
  const approveYAML = useApproveYAML(jobId, selectedVersion?.version_number ?? 0);

  const codeBg = useColorModeValue('gray.50', 'gray.900');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const rowHover = useColorModeValue('gray.50', 'gray.750');
  const selectedBg = useColorModeValue('brand.50', 'brand.900');

  const handleSelectVersion = async (v: YAMLVersionSummary) => {
    setSelectedVersion(v);
    setYamlContent('');
    try {
      const data = await yamlApi.getVersion(jobId, v.version_number);
      setYamlContent(data.yaml_content ?? '');
    } catch {
      setYamlContent('');
    }
  };

  const handleCopyYaml = () => {
    if (yamlContent) {
      navigator.clipboard.writeText(yamlContent);
      toast.success('YAML copied to clipboard');
    }
  };

  const handleApproveConfirm = () => {
    if (!selectedVersion) return;
    approveYAML.mutate(
      { approved_by: username, comments: approveComments || undefined },
      { onSuccess: () => { onApproveClose(); setApproveComments(''); } }
    );
  };

  const canGenerate = currentState === 'CREATED';
  const canRegenerate = currentState === 'REGENERATE_REQUESTED';

  return (
    <Box position="relative">
      {/* Generation overlay */}
      {(generateYAML.isPending || regenerateYAML.isPending) && (
        <GenerationProcessingOverlay type="yaml" />
      )}
      {/* Action buttons */}
      <HStack mb={4} spacing={3}>
        {canGenerate && (
          <Button
            leftIcon={<FiZap />}
            colorScheme="brand"
            size="sm"
            isLoading={generateYAML.isPending}
            loadingText="Generating…"
            onClick={() => generateYAML.mutate({ performed_by: username, force_regenerate: false })}
          >
            Generate YAML
          </Button>
        )}
        {canRegenerate && (
          <Button
            leftIcon={<FiRefreshCw />}
            colorScheme="yellow"
            size="sm"
            isLoading={regenerateYAML.isPending}
            loadingText="Regenerating…"
            onClick={() =>
              regenerateYAML.mutate({
                performed_by: username,
                include_previous_comments: true,
              })
            }
          >
            Regenerate YAML
          </Button>
        )}
        {selectedVersion && selectedVersion.is_valid && !selectedVersion.is_approved && (
          <Button
            leftIcon={<FiCheck />}
            colorScheme="green"
            size="sm"
            variant="outline"
            onClick={onApproveOpen}
          >
            Approve v{selectedVersion.version_number}
          </Button>
        )}
      </HStack>

      {isLoading ? (
        <SkeletonText noOfLines={6} spacing={3} />
      ) : !versions || versions.length === 0 ? (
        <Flex direction="column" align="center" py={12} gap={3}>
          <Icon as={FiFileText} boxSize={10} color="gray.500" />
          <Text color="gray.400">No YAML versions yet</Text>
          {canGenerate && (
            <Text fontSize="sm" color="gray.500">
              Click "Generate YAML" to start the migration workflow
            </Text>
          )}
        </Flex>
      ) : (
        <Grid templateColumns={{ base: '1fr', lg: '280px 1fr' }} gap={4}>
          {/* Version list */}
          <Box
            border="1px solid"
            borderColor={borderColor}
            borderRadius="lg"
            overflow="hidden"
          >
            <Box bg={codeBg} px={3} py={2} borderBottom="1px solid" borderColor={borderColor}>
              <Text fontSize="xs" fontWeight="semibold" color="gray.500" textTransform="uppercase">
                Versions
              </Text>
            </Box>
            {versions.map((v) => (
              <Box
                key={v.id}
                px={3}
                py={2.5}
                cursor="pointer"
                bg={selectedVersion?.id === v.id ? selectedBg : undefined}
                _hover={{ bg: selectedVersion?.id === v.id ? selectedBg : rowHover }}
                borderBottom="1px solid"
                borderColor={borderColor}
                onClick={() => handleSelectVersion(v)}
                transition="background 0.1s"
              >
                <Flex justify="space-between" align="center">
                  <Text fontSize="sm" fontWeight="medium">
                    Version {v.version_number}
                  </Text>
                  <HStack spacing={1}>
                    {v.is_approved && (
                      <Badge colorScheme="green" fontSize="xs" variant="subtle">Approved</Badge>
                    )}
                    <Badge
                      colorScheme={v.is_valid ? 'cyan' : 'red'}
                      fontSize="xs"
                      variant="subtle"
                    >
                      {v.is_valid ? 'Valid' : 'Invalid'}
                    </Badge>
                  </HStack>
                </Flex>
                <Text fontSize="xs" color="gray.500" mt={0.5}>
                  by {v.generated_by} · {useAbsoluteTimestamps ? formatDateTime(v.created_at) : timeAgo(v.created_at)}
                </Text>
                {v.has_errors && (
                  <Text fontSize="xs" color="red.400" mt={0.5}>
                    {v.error_count} validation error{v.error_count > 1 ? 's' : ''}
                  </Text>
                )}
              </Box>
            ))}
          </Box>

          {/* YAML content */}
          <Box>
            {selectedVersion ? (
              <>
                <Flex justify="space-between" align="center" mb={2}>
                  <HStack spacing={2}>
                    <Text fontSize="sm" fontWeight="medium" color="gray.400">
                      Version {selectedVersion.version_number}
                    </Text>
                    {selectedVersion.is_approved && selectedVersion.approved_by && (
                      <Text fontSize="xs" color="green.400">
                        · approved by {selectedVersion.approved_by}
                      </Text>
                    )}
                  </HStack>
                  <Tooltip label="Copy YAML" hasArrow>
                    <IconButton
                      aria-label="Copy YAML"
                      icon={<FiCopy />}
                      size="xs"
                      variant="ghost"
                      onClick={handleCopyYaml}
                    />
                  </Tooltip>
                </Flex>
                <Box
                  as="pre"
                  bg={codeBg}
                  border="1px solid"
                  borderColor={borderColor}
                  borderRadius="lg"
                  p={4}
                  fontSize="xs"
                  fontFamily="mono"
                  overflowX="auto"
                  whiteSpace="pre-wrap"
                  maxH="550px"
                  overflowY="auto"
                  lineHeight={1.7}
                >
                  {yamlContent || <Spinner size="sm" />}
                </Box>
              </>
            ) : (
              <Flex align="center" justify="center" h="200px">
                <Text color="gray.500" fontSize="sm">Select a version to view its content</Text>
              </Flex>
            )}
          </Box>
        </Grid>
      )}

      {/* Approve Modal */}
      <Modal isOpen={isApproveOpen} onClose={onApproveClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Approve YAML Version {selectedVersion?.version_number}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl>
              <FormLabel fontSize="sm">Comments (optional)</FormLabel>
              <Textarea
                value={approveComments}
                onChange={(e) => setApproveComments(e.target.value)}
                placeholder="Any notes about this YAML version…"
                rows={4}
                resize="vertical"
              />
            </FormControl>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={onApproveClose}>Cancel</Button>
            <Button
              colorScheme="green"
              leftIcon={<FiCheck />}
              isLoading={approveYAML.isPending}
              onClick={handleApproveConfirm}
            >
              Approve
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

// ─── Overview Panel ───────────────────────────────────────────────────────────

function OverviewPanel({ jobId }: { jobId: number }) {
  const { data: job, isLoading } = useJob(jobId);
  const navigate = useNavigate();
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const labelColor = useColorModeValue('gray.500', 'gray.400');

  if (isLoading) return <SkeletonText noOfLines={10} spacing={4} />;
  if (!job) return null;

  const fields: { label: string; value: string | null | number | undefined }[] = [
    { label: 'Job ID', value: `#${job.id}` },
    { label: 'Job Type', value: job.job_type === 'CODE_CONVERSION' ? 'Job 2 — Code Conversion' : 'Job 1 — YAML Conversion' },
    { label: 'Target Language', value: languageLabel(job.target_language) },
    { label: 'State', value: stateLabel(job.current_state) },
    { label: 'Source File', value: job.source_filename },
    { label: 'Pick Basic Version', value: job.pick_basic_version },
    { label: 'Created By', value: job.created_by },
    { label: 'Created At', value: formatDateTime(job.created_at) },
    { label: 'Last Updated', value: formatDateTime(job.updated_at) },
    { label: 'Completed At', value: job.completed_at ? formatDate(job.completed_at) : null },
    { label: 'Description', value: job.description },
  ];

  return (
    <Grid templateColumns={{ base: '1fr', md: '1fr 1fr', lg: '2fr 1fr' }} gap={5}>
      {/* Metadata */}
      <GridItem>
        <Box bg={bg} border="1px solid" borderColor={borderColor} borderRadius="xl" p={5}>
          <Heading size="sm" mb={4} color="gray.400" textTransform="uppercase" letterSpacing="wider">
            Job Metadata
          </Heading>
          <VStack align="stretch" spacing={3} divider={<Divider />}>
            {fields.map(({ label, value }) => (
              <Flex key={label} justify="space-between" align="flex-start" gap={4}>
                <Text fontSize="sm" color={labelColor} minW="130px" flexShrink={0}>
                  {label}
                </Text>
                <Text fontSize="sm" textAlign="right" wordBreak="break-word" fontFamily={label === 'Job ID' ? 'mono' : undefined}>
                  {value ?? <Text as="span" color="gray.500" fontStyle="italic">—</Text>}
                </Text>
              </Flex>
            ))}
            {job.parent_job_id != null && (
              <Flex justify="space-between" align="flex-start" gap={4}>
                <Text fontSize="sm" color={labelColor} minW="130px" flexShrink={0}>
                  Parent Job
                </Text>
                <Button
                  as="a"
                  href={`/jobs/${job.parent_job_id}`}
                  size="xs"
                  variant="link"
                  colorScheme="brand"
                  fontFamily="mono"
                  textAlign="right"
                >
                  #{job.parent_job_id} ↗
                </Button>
              </Flex>
            )}
          </VStack>
        </Box>
      </GridItem>

      {/* Stats */}
      <GridItem>
        <VStack spacing={4} align="stretch">
          <Box bg={bg} border="1px solid" borderColor={borderColor} borderRadius="xl" p={5}>
            <Heading size="sm" mb={4} color="gray.400" textTransform="uppercase" letterSpacing="wider">
              Counts
            </Heading>
            <Grid templateColumns="1fr 1fr" gap={4}>
              {[
                { label: 'YAML Versions', value: job.yaml_versions_count },
                { label: 'Reviews', value: job.reviews_count },
              ].map(({ label, value }) => (
                <Stat key={label}>
                  <StatLabel fontSize="xs" color="gray.500">{label}</StatLabel>
                  <StatNumber fontSize="2xl">{value}</StatNumber>
                </Stat>
              ))}
            </Grid>
          </Box>

          <Box bg={bg} border="1px solid" borderColor={borderColor} borderRadius="xl" p={5}>
            <Heading size="sm" mb={3} color="gray.400" textTransform="uppercase" letterSpacing="wider">
              Current State
            </Heading>
            <Badge
              colorScheme={stateColorScheme(job.current_state)}
              fontSize="sm"
              px={3}
              py={1}
              borderRadius="full"
              variant="subtle"
            >
              {stateLabel(job.current_state)}
            </Badge>
            {job.current_state === 'COMPLETED' && (
              <Text fontSize="xs" color="green.400" mt={2}>
                Migration completed successfully
              </Text>
            )}
            {job.current_state === 'YAML_APPROVED_QUEUED' && (
              <VStack align="flex-start" spacing={2} mt={2}>
                <Text fontSize="xs" color="teal.400">
                  YAML approved — ready for code generation in Studio
                </Text>
                <Button
                  size="sm"
                  colorScheme="teal"
                  leftIcon={<FiZap />}
                  onClick={() => navigate('/')}
                  data-testid="open-in-studio-btn"
                >
                  Open in Studio
                </Button>
              </VStack>
            )}
            {job.current_state === 'REGENERATE_REQUESTED' && (
              <Text fontSize="xs" color="yellow.400" mt={2}>
                Awaiting YAML regeneration with feedback
              </Text>
            )}
            {job.current_state === 'CODE_REGENERATE_REQUESTED' && (
              <Text fontSize="xs" color="pink.400" mt={2}>
                Awaiting code regeneration with reviewer feedback
              </Text>
            )}
            {job.current_state === 'CODE_ACCEPTED' && (
              <Text fontSize="xs" color="teal.400" mt={2}>
                Code accepted — migration pipeline complete
              </Text>
            )}
          </Box>
        </VStack>
      </GridItem>
    </Grid>
  );
}

// ─── Code Generation Modal ────────────────────────────────────────────────────

function CodeGenModal({
  jobId,
  defaultLanguage,
  isOpen,
  onClose,
}: {
  jobId: number;
  defaultLanguage: TargetLanguage;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { user } = useAuthStore();
  const [language, setLanguage] = useState<TargetLanguage>(defaultLanguage);
  const [useLLM, setUseLLM] = useState(true);
  const toast = useToast();
  const generateCode = useGenerateCode(jobId);

  const LANGUAGES: { value: TargetLanguage; label: string }[] = [
    { value: 'PYTHON', label: 'Python' },
    { value: 'TYPESCRIPT', label: 'TypeScript' },
    { value: 'JAVASCRIPT', label: 'JavaScript' },
    { value: 'JAVA', label: 'Java' },
    { value: 'CSHARP', label: 'C#' },
  ];

  const handleGenerate = async () => {
    try {
      await generateCode.mutateAsync({
        target_language: language,
        performed_by: user?.username ?? 'system',
        use_llm: useLLM,
      });
      onClose();
    } catch {
      // error already toasted by the mutation
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent position="relative">
        {generateCode.isPending && (
          <GenerationProcessingOverlay type="code" language={language} />
        )}
        <ModalHeader>
          <HStack spacing={2}>
            <Icon as={FiTerminal} color="purple.400" />
            <Text>Generate Code</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl>
              <FormLabel fontSize="sm">Target Language</FormLabel>
              <Select
                value={language}
                onChange={(e) => setLanguage(e.target.value as TargetLanguage)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <Flex justify="space-between" align="center">
                <VStack align="start" spacing={0}>
                  <Text fontSize="sm" fontWeight="medium">Use LLM</Text>
                  <Text fontSize="xs" color="gray.400">
                    LLM produces higher-quality output. Disable for pure rule-based mapping.
                  </Text>
                </VStack>
                <Switch
                  isChecked={useLLM}
                  onChange={(e) => setUseLLM(e.target.checked)}
                  colorScheme="purple"
                />
              </Flex>
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            colorScheme="purple"
            leftIcon={<Icon as={FiTerminal} />}
            isLoading={generateCode.isPending}
            loadingText="Generating…"
            onClick={handleGenerate}
          >
            Generate
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ─── Generated Code Panel ─────────────────────────────────────────────────────

function GeneratedCodePanel({ jobId, currentState }: { jobId: number; currentState: JobState }) {
  const { data: versions, isLoading } = useCodeVersions(jobId);
  const [selectedVN, setSelectedVN] = useState<number | null>(null);
  const restore = useRestoreCodeVersion(jobId);
  const useAbsoluteTimestamps = usePrefsStore((s) => s.useAbsoluteTimestamps);
  const [copied, setCopied] = useState(false);
  const { isOpen: isRestoreOpen, onOpen: onRestoreOpen, onClose: onRestoreClose } = useDisclosure();
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Determine which version to display: user-selected or the current one
  const displayVN = selectedVN ?? (versions?.find((v) => v.is_current)?.version_number ?? null);
  const { data: detail, isLoading: detailLoading } = useCodeVersion(jobId, displayVN);

  const bg = useColorModeValue('white', 'gray.800');
  const codeBg = useColorModeValue('gray.900', 'gray.950');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const labelColor = useColorModeValue('gray.500', 'gray.400');
  const selectedBg = useColorModeValue('purple.50', 'purple.900');
  const rowHover = useColorModeValue('gray.50', 'gray.700');

  const hasCode =
    currentState === 'CODE_GENERATED' ||
    currentState === 'CODE_UNDER_REVIEW' ||
    currentState === 'CODE_REGENERATE_REQUESTED' ||
    currentState === 'CODE_ACCEPTED' ||
    currentState === 'COMPLETED';

  const handleCopy = () => {
    if (!detail?.code_content) return;
    navigator.clipboard.writeText(detail.code_content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRestore = () => {
    if (displayVN == null) return;
    restore.mutate(displayVN, { onSuccess: onRestoreClose });
  };

  if (!hasCode && (!versions || versions.length === 0)) {
    return (
      <Flex direction="column" align="center" py={14} gap={3}>
        <Icon as={FiCode} boxSize={12} color="gray.500" />
        <Text fontWeight="semibold" color="gray.400">No code generated yet</Text>
        <Text fontSize="sm" color="gray.500" textAlign="center" maxW="400px">
          Code will appear here once the YAML has been approved and code generation is triggered.
        </Text>
      </Flex>
    );
  }

  if (isLoading) {
    return (
      <VStack spacing={3} align="stretch">
        <Skeleton h="32px" />
        <Skeleton h="320px" />
      </VStack>
    );
  }

  const selectedVersion = versions?.find((v) => v.version_number === displayVN) ?? versions?.[0] ?? null;
  const lines = detail?.code_content?.split('\n').length ?? 0;

  return (
    <VStack spacing={4} align="stretch">
      {(!versions || versions.length === 0) ? (
        <Alert status="warning" borderRadius="lg">
          <AlertIcon />
          <AlertDescription>Could not load generated code.</AlertDescription>
        </Alert>
      ) : (
        <Box border="1px solid" borderColor={borderColor} borderRadius="xl" overflow="hidden">
          <Flex>
            {/* ── Version list (left pane) ── */}
            <Box
              w="220px"
              flexShrink={0}
              borderRight="1px solid"
              borderColor={borderColor}
              overflowY="auto"
              maxH="600px"
            >
              <Box bg={codeBg} px={3} py={2} borderBottom="1px solid" borderColor={borderColor}>
                <Text fontSize="xs" color="gray.400" fontWeight="semibold" textTransform="uppercase">
                  Versions
                </Text>
              </Box>
              {versions.map((v) => (
                <Flex
                  key={v.id}
                  px={3}
                  py={2.5}
                  align="start"
                  gap={2}
                  cursor="pointer"
                  direction="column"
                  borderBottom="1px solid"
                  borderColor={borderColor}
                  bg={displayVN === v.version_number ? selectedBg : undefined}
                  _hover={{ bg: displayVN === v.version_number ? selectedBg : rowHover }}
                  onClick={() => setSelectedVN(v.version_number)}
                >
                  <HStack spacing={1.5} flexWrap="wrap">
                    <Badge fontFamily="mono" colorScheme="purple" variant={v.is_current ? 'solid' : 'outline'} fontSize="xs">
                      v{v.version_number ?? '?'}
                    </Badge>
                    {v.is_current && (
                      <Badge colorScheme="green" variant="subtle" fontSize="2xs">current</Badge>
                    )}
                    {v.is_accepted && (
                      <Badge colorScheme="teal" variant="subtle" fontSize="2xs">accepted</Badge>
                    )}
                  </HStack>
                  <HStack spacing={1} flexWrap="wrap">
                    <Badge colorScheme="cyan" variant="subtle" fontSize="2xs">
                      {languageLabel(v.target_language)}
                    </Badge>
                    {v.estimated_lines_of_code != null && (
                      <Text fontSize="2xs" color="gray.500">{v.estimated_lines_of_code}L</Text>
                    )}
                  </HStack>
                  <Text fontSize="2xs" color="gray.500">
                    {useAbsoluteTimestamps ? formatDateTime(v.generated_at) : timeAgo(v.generated_at)}
                  </Text>
                </Flex>
              ))}
            </Box>

            {/* ── Code viewer (right pane) ── */}
            <Box flex={1} minW={0}>
              {detailLoading || !detail ? (
                <Flex align="center" justify="center" h="200px">
                  <Spinner size="sm" color="purple.400" />
                </Flex>
              ) : (
                <Box>
                  {/* Toolbar */}
                  <Flex
                    bg={useColorModeValue('gray.100', 'gray.900')}
                    px={4}
                    py={2}
                    align="center"
                    justify="space-between"
                    borderBottom="1px solid"
                    borderColor={borderColor}
                    flexWrap="wrap"
                    gap={2}
                  >
                    <HStack spacing={2}>
                      <Icon as={FiCode} boxSize={3.5} color="purple.400" />
                      <Text fontSize="xs" color="gray.400" fontWeight="medium">
                        v{detail.version_number ?? '?'} · {languageLabel(detail.target_language)} · {lines} lines
                      </Text>
                      {detail.validation_tool_available === false && (
                        <Tooltip label="Syntax validator not available for this language" hasArrow>
                          <Badge colorScheme="orange" variant="subtle" fontSize="2xs">no-validator</Badge>
                        </Tooltip>
                      )}
                      {detail.validation_errors && detail.validation_errors.length > 0 && (
                        <Tooltip
                          label={`Syntax errors: ${detail.validation_errors.slice(0, 3).join('; ')}`}
                          hasArrow
                        >
                          <Badge colorScheme="red" variant="subtle" fontSize="2xs">
                            {detail.validation_errors.length} syntax error{detail.validation_errors.length > 1 ? 's' : ''}
                          </Badge>
                        </Tooltip>
                      )}
                    </HStack>
                    <HStack spacing={1}>
                      {/* Restore button — only for non-current versions */}
                      {!detail.is_current && (
                        <Tooltip label="Restore this version for re-review" hasArrow>
                          <IconButton
                            aria-label="Restore version"
                            icon={<FiRefreshCw />}
                            size="xs"
                            variant="ghost"
                            colorScheme="purple"
                            onClick={onRestoreOpen}
                          />
                        </Tooltip>
                      )}
                      <Tooltip label={copied ? 'Copied!' : 'Copy code'} hasArrow>
                        <IconButton
                          aria-label="Copy"
                          icon={<FiCopy />}
                          size="xs"
                          variant="ghost"
                          onClick={handleCopy}
                          colorScheme={copied ? 'green' : 'gray'}
                        />
                      </Tooltip>
                      {detail.is_accepted ? (
                        <Tooltip label="Download" hasArrow>
                          <IconButton
                            aria-label="Download"
                            as="a"
                            href={codeApi.downloadUrl(jobId, detail.id)}
                            download
                            icon={<FiDownload />}
                            size="xs"
                            variant="ghost"
                          />
                        </Tooltip>
                      ) : (
                        <Tooltip label="Code must be accepted before download" hasArrow>
                          <IconButton
                            aria-label="Download disabled"
                            icon={<FiDownload />}
                            size="xs"
                            variant="ghost"
                            isDisabled
                            opacity={0.4}
                          />
                        </Tooltip>
                      )}
                    </HStack>
                  </Flex>

                  {/* Review status */}
                  {!detail.is_accepted && detail.is_current && (
                    <Alert status="warning" borderRadius={0} variant="left-accent" py={2}>
                      <AlertIcon boxSize={3.5} />
                      <AlertDescription fontSize="xs">
                        Awaiting review — download disabled until accepted.
                      </AlertDescription>
                    </Alert>
                  )}
                  {!detail.is_current && (
                    <Alert status="info" borderRadius={0} variant="left-accent" py={2}>
                      <AlertIcon boxSize={3.5} />
                      <AlertDescription fontSize="xs">
                        Viewing v{detail.version_number} (historical). Use the restore button to re-submit for review.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Metadata row */}
                  {selectedVersion && (
                    <Grid
                      templateColumns={{ base: '1fr 1fr', md: 'repeat(4, 1fr)' }}
                      gap={3}
                      px={4}
                      py={3}
                      bg={bg}
                      borderBottom="1px solid"
                      borderColor={borderColor}
                    >
                      {[
                        { label: 'Language', value: languageLabel(detail.target_language) },
                        { label: 'Lines', value: `${detail.estimated_lines_of_code ?? lines}` },
                        { label: 'LLM model', value: detail.llm_model_used ?? '—' },
                        { label: 'Generated', value: formatDateTime(detail.generated_at) },
                      ].map(({ label, value }) => (
                        <VStack key={label} align="start" spacing={0.5}>
                          <Text fontSize="2xs" color={labelColor} textTransform="uppercase" fontWeight="semibold">
                            {label}
                          </Text>
                          <Text fontSize="xs" fontFamily={label === 'LLM model' ? 'mono' : undefined} isTruncated>
                            {value}
                          </Text>
                        </VStack>
                      ))}
                    </Grid>
                  )}

                  {/* Code content */}
                  <Code
                    display="block"
                    whiteSpace="pre"
                    overflowX="auto"
                    overflowY="auto"
                    maxH="460px"
                    fontSize="xs"
                    lineHeight={1.7}
                    p={5}
                    bg={codeBg}
                    color="gray.100"
                    borderRadius={0}
                    w="full"
                    fontFamily="'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace"
                  >
                    {detail.code_content}
                  </Code>
                </Box>
              )}
            </Box>
          </Flex>
        </Box>
      )}

      {/* Restore confirmation dialog */}
      <AlertDialog isOpen={isRestoreOpen} leastDestructiveRef={cancelRef} onClose={onRestoreClose}>
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Restore Code Version {displayVN}
            </AlertDialogHeader>
            <AlertDialogBody>
              This will make v{displayVN} the current active version and reset its accepted status.
              The job will return to <strong>CODE_UNDER_REVIEW</strong> for a fresh review.
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={onRestoreClose}>Cancel</Button>
              <Button
                colorScheme="purple"
                onClick={handleRestore}
                isLoading={restore.isPending}
                ml={3}
              >
                Restore v{displayVN}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </VStack>
  );
}



// ─── Action Buttons ───────────────────────────────────────────────────────────

const ACTION_LABELS: Partial<Record<JobState, { label: string; colorScheme: string; icon?: typeof FiCheck }>> = {
  YAML_GENERATED: { label: 'Start Review', colorScheme: 'orange', icon: FiFileText },
  UNDER_REVIEW: { label: 'Review Actions…', colorScheme: 'blue' },
  APPROVED: { label: 'Generate Code', colorScheme: 'purple', icon: FiCode },
  APPROVED_WITH_COMMENTS: { label: 'Generate Code', colorScheme: 'purple', icon: FiCode },
  CODE_GENERATED: { label: 'Start Code Review', colorScheme: 'purple', icon: FiCode },
  CODE_UNDER_REVIEW: { label: 'Code Review Actions…', colorScheme: 'blue' },
  CODE_REGENERATE_REQUESTED: { label: 'Regenerate Code', colorScheme: 'yellow', icon: FiRefreshCw },
};

function ActionPanel({
  jobId,
  currentState,
  allowedTransitions,
  defaultLanguage,
}: {
  jobId: number;
  currentState: JobState;
  allowedTransitions: string[];
  defaultLanguage: TargetLanguage;
}) {
  const user = useAuthStore((s) => s.user);
  const username = user?.username ?? 'system';
  const transition = useTransitionJob(jobId);
  const { isOpen: isTransOpen, onOpen: onTransOpen, onClose: onTransClose } = useDisclosure();
  const { isOpen: isCodeGenOpen, onOpen: onCodeGenOpen, onClose: onCodeGenClose } = useDisclosure();
  const [targetState, setTargetState] = useState<JobState | null>(null);
  const [reason, setReason] = useState('');

  if (allowedTransitions.length === 0) {
    return (
      <Badge colorScheme="green" variant="subtle" px={3} py={1.5} borderRadius="full" fontSize="sm">
        {currentState === 'COMPLETED' ? '✓ Completed' : stateLabel(currentState)}
      </Badge>
    );
  }

  const openTransition = (state: JobState) => {
    setTargetState(state);
    setReason('');
    onTransOpen();
  };

  const confirm = () => {
    if (!targetState) return;
    transition.mutate(
      { new_state: targetState, reason: reason || undefined },
      { onSuccess: () => { onTransClose(); setTargetState(null); } }
    );
  };

  // APPROVED / APPROVED_WITH_COMMENTS → open the code-gen modal
  if (currentState === 'APPROVED' || currentState === 'APPROVED_WITH_COMMENTS') {
    return (
      <>
        <Button
          leftIcon={<Icon as={FiCode} />}
          colorScheme="purple"
          size="sm"
          onClick={onCodeGenOpen}
        >
          Generate Code
        </Button>
        <CodeGenModal
          jobId={jobId}
          defaultLanguage={defaultLanguage}
          isOpen={isCodeGenOpen}
          onClose={onCodeGenClose}
        />
      </>
    );
  }

  // CODE_REGENERATE_REQUESTED → open the code-gen modal to regenerate
  if (currentState === 'CODE_REGENERATE_REQUESTED') {
    return (
      <>
        <Button
          leftIcon={<Icon as={FiRefreshCw} />}
          colorScheme="yellow"
          size="sm"
          onClick={onCodeGenOpen}
        >
          Regenerate Code
        </Button>
        <CodeGenModal
          jobId={jobId}
          defaultLanguage={defaultLanguage}
          isOpen={isCodeGenOpen}
          onClose={onCodeGenClose}
        />
      </>
    );
  }

  // UNDER_REVIEW has multiple choices → use Menu
  if (currentState === 'UNDER_REVIEW') {
    return (
      <>
        <Menu>
          <MenuButton
            as={Button}
            rightIcon={<FiChevronDown />}
            colorScheme="blue"
            size="sm"
            isLoading={transition.isPending}
          >
            Review Actions
          </MenuButton>
          <MenuList>
            <MenuItem icon={<FiCheck />} onClick={() => openTransition('APPROVED')}>
              Approve YAML
            </MenuItem>
            <MenuItem icon={<FiCheck />} onClick={() => openTransition('APPROVED_WITH_COMMENTS')}>
              Approve with Comments
            </MenuItem>
            <MenuItem icon={<FiRefreshCw />} onClick={() => openTransition('REGENERATE_REQUESTED')}>
              Request Regeneration
            </MenuItem>
          </MenuList>
        </Menu>
        <TransitionModal
          isOpen={isTransOpen}
          onClose={onTransClose}
          targetState={targetState}
          reason={reason}
          onReasonChange={setReason}
          onConfirm={confirm}
          isLoading={transition.isPending}
        />
      </>
    );
  }

  // CODE_UNDER_REVIEW → multi-choice: Accept Code / Reject & Regenerate
  if (currentState === 'CODE_UNDER_REVIEW') {
    return (
      <>
        <Menu>
          <MenuButton
            as={Button}
            rightIcon={<FiChevronDown />}
            colorScheme="purple"
            size="sm"
            isLoading={transition.isPending}
          >
            Code Review Actions
          </MenuButton>
          <MenuList>
            <MenuItem icon={<FiCheck />} onClick={() => openTransition('CODE_ACCEPTED')}>
              Accept Code
            </MenuItem>
            <MenuItem icon={<FiRefreshCw />} onClick={() => openTransition('CODE_REGENERATE_REQUESTED')}>
              Reject — Request Regeneration
            </MenuItem>
          </MenuList>
        </Menu>
        <TransitionModal
          isOpen={isTransOpen}
          onClose={onTransClose}
          targetState={targetState}
          reason={reason}
          onReasonChange={setReason}
          onConfirm={confirm}
          isLoading={transition.isPending}
        />
      </>
    );
  }

  // Single allowed transition
  const nextState = allowedTransitions[0] as JobState;
  const action = ACTION_LABELS[nextState] ?? ACTION_LABELS[currentState];

  return (
    <>
      <Button
        leftIcon={action?.icon ? <Icon as={action.icon} /> : undefined}
        colorScheme={action?.colorScheme ?? 'brand'}
        size="sm"
        isLoading={transition.isPending}
        onClick={() => openTransition(nextState)}
      >
        {action?.label ?? stateLabel(nextState)}
      </Button>
      <TransitionModal
        isOpen={isTransOpen}
        onClose={onTransClose}
        targetState={targetState}
        reason={reason}
        onReasonChange={setReason}
        onConfirm={confirm}
        isLoading={transition.isPending}
      />
    </>
  );
}

function TransitionModal({
  isOpen,
  onClose,
  targetState,
  reason,
  onReasonChange,
  onConfirm,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  targetState: JobState | null;
  reason: string;
  onReasonChange: (v: string) => void;
  onConfirm: () => void;
  isLoading: boolean;
}) {
  if (!targetState) return null;
  const needsReason = targetState === 'REGENERATE_REQUESTED' || targetState === 'CODE_REGENERATE_REQUESTED';
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          Transition to: {stateLabel(targetState)}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="sm" color="gray.400" mb={3}>
            Are you sure you want to move this job to{' '}
            <Badge colorScheme={stateColorScheme(targetState)} variant="subtle">
              {stateLabel(targetState)}
            </Badge>
            ?
          </Text>
          <FormControl>
            <FormLabel fontSize="sm">
              Reason {needsReason ? '' : '(optional)'}
            </FormLabel>
            <Textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder={
                needsReason
                  ? 'Describe what needs to be changed in the regenerated YAML…'
                  : 'Optional note about this transition…'
              }
              rows={3}
              resize="vertical"
            />
          </FormControl>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            colorScheme={stateColorScheme(targetState)}
            isLoading={isLoading}
            isDisabled={needsReason && !reason.trim()}
            onClick={onConfirm}
          >
            Confirm
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ─── Job Detail Page ──────────────────────────────────────────────────────────

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const jobId = Number(id);
  const navigate = useNavigate();
  const useAbsoluteTimestamps = usePrefsStore((s) => s.useAbsoluteTimestamps);

  const { data: job, isLoading, isError } = useJob(jobId);
  const { data: transitions } = useAllowedTransitions(jobId);
  const deleteJob = useDeleteJob();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();
  const cancelRef = useRef<HTMLButtonElement>(null);

  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const headerBg = useColorModeValue('gray.50', 'gray.900');

  const handleDelete = () => {
    deleteJob.mutate(jobId, {
      onSuccess: () => {
        onDeleteClose();
        navigate('/jobs');
      },
    });
  };

  if (isLoading) {
    return (
      <Container maxW="full" py={8} px={{ base: 4, md: 8 }}>
        <Skeleton h="32px" mb={4} maxW="300px" />
        <Skeleton h="80px" mb={6} />
        <SkeletonText noOfLines={8} spacing={4} />
      </Container>
    );
  }

  if (isError || !job) {
    return (
      <Container maxW="full" py={8} px={{ base: 4, md: 8 }}>
        <Alert status="error" borderRadius="lg">
          <AlertIcon />
          <AlertDescription>
            Job #{jobId} not found or could not be loaded.{' '}
            <Button variant="link" colorScheme="red" onClick={() => navigate('/jobs')}>
              Back to Jobs
            </Button>
          </AlertDescription>
        </Alert>
      </Container>
    );
  }

  const allowedTransitions = transitions?.allowed_transitions ?? [];

  return (
    <Container maxW="full" py={6} px={{ base: 4, md: 8 }}>
      {/* ── Header ───────────────────────────────────────────── */}
      <Flex
        align="center"
        justify="space-between"
        bg={bg}
        border="1px solid"
        borderColor={borderColor}
        borderRadius="xl"
        px={5}
        py={4}
        mb={5}
        gap={4}
        flexWrap="wrap"
      >
        <HStack spacing={4}>
          <Tooltip label="Back to Jobs" hasArrow>
            <IconButton
              aria-label="Back"
              icon={<FiArrowLeft />}
              size="sm"
              variant="ghost"
              onClick={() => navigate('/jobs')}
            />
          </Tooltip>
          <Divider orientation="vertical" h={6} />
          <VStack align="start" spacing={0}>
            <Heading size="md" noOfLines={1}>
              {job.job_name ?? `Job #${job.id}`}
            </Heading>
            <HStack spacing={2} mt={0.5} flexWrap="wrap">
              <Badge
                colorScheme={job.job_type === 'CODE_CONVERSION' ? 'purple' : 'blue'}
                variant="outline"
                fontSize="xs"
              >
                {job.job_type === 'CODE_CONVERSION' ? 'Job 2' : 'Job 1'}
              </Badge>
              <Badge colorScheme={stateColorScheme(job.current_state)} variant="subtle" fontSize="xs">
                {stateLabel(job.current_state)}
              </Badge>
              {job.target_language && (
                <Badge colorScheme="cyan" variant="subtle" fontSize="xs">
                  {languageLabel(job.target_language)}
                </Badge>
              )}
              {job.parent_job_id != null && (
                <Button
                  as="a"
                  href={`/jobs/${job.parent_job_id}`}
                  size="xs"
                  variant="link"
                  colorScheme="gray"
                  fontSize="xs"
                  fontFamily="mono"
                >
                  ← Job 1 #{job.parent_job_id}
                </Button>
              )}
              <Text fontSize="xs" color="gray.500">
                · updated {useAbsoluteTimestamps ? formatDateTime(job.updated_at) : timeAgo(job.updated_at)}
              </Text>
            </HStack>
          </VStack>
        </HStack>

        <HStack spacing={2}>
          {/* State transition action button */}
          <ActionPanel
            jobId={jobId}
            currentState={job.current_state}
            allowedTransitions={allowedTransitions}
            defaultLanguage={(job.target_language ?? 'PYTHON') as TargetLanguage}
          />
          <Tooltip label="Delete job" hasArrow>
            <IconButton
              aria-label="Delete"
              icon={<FiTrash2 />}
              size="sm"
              variant="ghost"
              colorScheme="red"
              onClick={onDeleteOpen}
            />
          </Tooltip>
        </HStack>
      </Flex>

      {/* ── Workflow Progress ─────────────────────────────────── */}
      <Box
        bg={bg}
        border="1px solid"
        borderColor={borderColor}
        borderRadius="xl"
        px={6}
        py={5}
        mb={5}
      >
        <WorkflowStepper currentState={job.current_state} jobType={job.job_type} />
      </Box>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <Box bg={bg} border="1px solid" borderColor={borderColor} borderRadius="xl" overflow="hidden">
        <Tabs variant="soft-rounded" colorScheme="brand" isLazy>
          <TabList bg={headerBg} px={5} py={3} gap={2} borderBottom="1px solid" borderColor={borderColor}>
            <Tab fontSize="sm">Overview</Tab>
            {job.job_type !== 'CODE_CONVERSION' && (
              <Tab fontSize="sm">Source Code</Tab>
            )}
            {job.job_type !== 'CODE_CONVERSION' && (
              <Tab fontSize="sm">
                YAML Versions
                {job.yaml_versions_count > 0 && (
                  <Badge ml={2} colorScheme="brand" variant="solid" borderRadius="full" fontSize="xs">
                    {job.yaml_versions_count}
                  </Badge>
                )}
              </Tab>
            )}
            {job.job_type === 'CODE_CONVERSION' && (
              <Tab fontSize="sm">
                <HStack spacing={1.5}>
                  <Icon as={FiTerminal} boxSize={3.5} />
                  <Text>Generated Code</Text>
                </HStack>
              </Tab>
            )}
          </TabList>
          <TabPanels>
            <TabPanel p={5}>
              <OverviewPanel jobId={jobId} />
            </TabPanel>
            {job.job_type !== 'CODE_CONVERSION' && (
              <TabPanel p={5}>
                <SourceCodePanel jobId={jobId} />
              </TabPanel>
            )}
            {job.job_type !== 'CODE_CONVERSION' && (
              <TabPanel p={5}>
                <YamlVersionsPanel jobId={jobId} currentState={job.current_state} />
              </TabPanel>
            )}
            {job.job_type === 'CODE_CONVERSION' && (
              <TabPanel p={5}>
                <GeneratedCodePanel jobId={jobId} currentState={job.current_state} />
              </TabPanel>
            )}
          </TabPanels>
        </Tabs>
      </Box>

      {/* ── Delete Confirm ────────────────────────────────────── */}
      <AlertDialog isOpen={isDeleteOpen} leastDestructiveRef={cancelRef} onClose={onDeleteClose} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader>Delete Job</AlertDialogHeader>
            <AlertDialogBody>
              Delete <strong>{job.job_name ?? `Job #${job.id}`}</strong>? All YAML versions, code, and reviews will be permanently removed.
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} variant="ghost" onClick={onDeleteClose}>Cancel</Button>
              <Button colorScheme="red" ml={3} isLoading={deleteJob.isPending} onClick={handleDelete}>
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Container>
  );
}
