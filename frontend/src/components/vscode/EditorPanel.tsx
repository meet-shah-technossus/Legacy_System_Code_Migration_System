import {
  Box,
  Flex,
  Icon,
  IconButton,
  Spinner,
  Text,
  Tooltip,
  VStack,
  Badge,
  HStack,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Textarea,
  Select,
} from '@chakra-ui/react';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { ComponentType } from 'react';
import { Global } from '@emotion/react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import {
  FiCode,
  FiFileText,
  FiX,
  FiDownload,
  FiExternalLink,
  FiPlay,
  FiAlertTriangle,
  FiChevronRight,
  FiCheckCircle,
  FiGitMerge,
  FiRotateCcw,
  FiMessageCircle,
  FiColumns,
  FiGitCommit,
  FiEdit,
  FiSave,
  FiGitBranch,
  FiZap,
  FiXCircle,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { VS, useVSColors } from './vscodeTheme';
import ResizeHandle from './ResizeHandle';
import VersionDiffPanel from './VersionDiffPanel';
import { useJob, useParentJob, useJobWithSource, useAddLineComment, useUpdateJob, useTransitionJob } from '../../hooks/useJobs';
import { useQueryClient, useIsMutating } from '@tanstack/react-query';
import { useLatestYAML, useGenerateYAML, YAML_KEYS, useEditYAMLVersion, useYAMLVersions, useYAMLVersion, useCreateYAMLVersion, useApproveYAML } from '../../hooks/useYaml';
import { useGeneratedCode, useGenerateCode, useEditCode, useCodeVersions, useCodeVersion, useCreateCodeVersion } from '../../hooks/useCode';
import GenerationProcessingOverlay from './GenerationProcessingOverlay';
import { useSubmitReview } from '../../hooks/useReviews';
import { useAuthStore } from '../../store/authStore';
import { stateLabel, monacoLanguage, languageLabel } from '../../utils/format';
import type { MigrationJob, TargetLanguage, PendingLineComment, LineCommentCreate, ReviewDecision } from '../../types';
import { codeApi } from '../../services/codeApi';

// ─── Constants ────────────────────────────────────────────────────────────────

type EditorTab = 'yaml' | 'code';

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

function codeFilename(job: MigrationJob): string {
  const base = job.source_filename
    ? job.source_filename.replace(/\.[^.]+$/, '')
    : job.job_name ?? `job-${job.id}`;
  if (job.target_language) return base + LANG_EXT[job.target_language];
  return base + '.code';
}

function yamlFilename(job: MigrationJob): string {
  const base = job.source_filename
    ? job.source_filename.replace(/\.[^.]+$/, '')
    : `job-${job.id}`;
  return base + '.schema.yaml';
}

// ─── Welcome Screen ───────────────────────────────────────────────────────────

function WelcomeScreen() {
  const colors = useVSColors();
  const navigate = useNavigate();
  return (
    <VStack flex={1} justify="center" align="center" spacing={6} h="100%" userSelect="none">
      <Icon as={FiCode as ComponentType} boxSize={20} color={colors.fgMuted} opacity={0.1} />

      <VStack spacing={2}>
        <Text fontSize="22px" fontWeight="300" color={colors.fg} opacity={0.35} letterSpacing="-0.02em">
          Legacy Migration Studio
        </Text>
        <Text fontSize="13px" color={colors.fgMuted} opacity={0.4}>
          Select a job from the Explorer to open it here
        </Text>
      </VStack>

      <VStack spacing="6px" mt={2}>
        {[
          { key: '⌘P',  desc: 'Go to job…',            action: () => {} },
          { key: '⌘N',  desc: 'New migration job',     action: () => navigate('/jobs/new') },
          { key: '⌘⇧A', desc: 'View all jobs',         action: () => navigate('/jobs') },
        ].map(({ key, desc, action }) => (
          <Flex key={key} align="center" gap={3} opacity={0.3} cursor="pointer" _hover={{ opacity: 0.6 }} onClick={action}>
            <Box
              px="7px" py="2px"
              bg={colors.input}
              border={`1px solid ${colors.inputBorder}`}
              borderRadius="3px"
            >
              <Text fontSize="10px" fontFamily="mono" color={colors.fg}>{key}</Text>
            </Box>
            <Text fontSize="12px" color={colors.fgMuted}>{desc}</Text>
          </Flex>
        ))}
      </VStack>
    </VStack>
  );
}

// ─── Tab ─────────────────────────────────────────────────────────────────────

interface TabProps {
  label: string;
  iconColor: string;
  isActive: boolean;
  isModified?: boolean;
  onClick: () => void;
}

function Tab({ label, iconColor, isActive, isModified, onClick }: TabProps) {
  const colors = useVSColors();
  const [hovered, setHovered] = useState(false);
  return (
    <Flex
      align="center"
      h={`${VS.size.tabBar}px`}
      px="12px"
      gap="6px"
      cursor="pointer"
      bg={isActive ? colors.tabActive : colors.tabInactive}
      borderRight={`1px solid ${colors.panelBorder}`}
      borderBottom={isActive ? `1px solid ${colors.tabActive}` : `1px solid ${colors.panelBorder}`}
      borderTop={isActive ? `1px solid ${colors.tabActiveBorder}` : '1px solid transparent'}
      color={isActive ? colors.fgActive : colors.fgMuted}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      flexShrink={0}
      userSelect="none"
      position="relative"
    >
      {/* language dot */}
      <Box w="8px" h="8px" borderRadius="full" bg={iconColor} flexShrink={0} />

      <Text fontSize="13px" whiteSpace="nowrap">
        {label}
        {isModified && <Box as="span" color={colors.fgMuted}> ●</Box>}
      </Text>

      {/* close — only on hover */}
      {hovered && (
        <Box
          as="button"
          ml="2px"
          p="1px"
          borderRadius="2px"
          color={colors.fgMuted}
          _hover={{ bg: colors.hover, color: colors.fgActive }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <Icon as={FiX as ComponentType} boxSize="10px" />
        </Box>
      )}
    </Flex>
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

interface BreadcrumbBarProps {
  segments: string[];
}

function BreadcrumbBar({ segments }: BreadcrumbBarProps) {
  const colors = useVSColors();
  return (
    <Flex
      h="24px"
      align="center"
      px={3}
      gap="4px"
      bg={colors.editor}
      borderBottom={`1px solid ${colors.sidebarBorder}`}
      flexShrink={0}
      overflow="hidden"
    >
      {segments.map((seg, i) => (
        <Flex key={i} align="center" gap="4px">
          {i > 0 && <Icon as={FiChevronRight as ComponentType} boxSize="9px" color={colors.fgMuted} />}
          <Text
            fontSize="11px"
            color={i === segments.length - 1 ? colors.fg : colors.fgMuted}
            overflow="hidden"
            textOverflow="ellipsis"
            whiteSpace="nowrap"
          >
            {seg}
          </Text>
        </Flex>
      ))}
    </Flex>
  );
}

// ─── Editor Info Bar ──────────────────────────────────────────────────────────

interface EditorInfoBarProps {
  job: MigrationJob;
  lineCount?: number;
  charCount?: number;
  language: string;
}

function EditorInfoBar({ job, lineCount, charCount, language }: EditorInfoBarProps) {
  const colors = useVSColors();
  return (
    <Flex
      h="22px"
      align="center"
      justify="space-between"
      px={3}
      bg={colors.tabBar}
      borderTop={`1px solid ${colors.panelBorder}`}
      flexShrink={0}
      userSelect="none"
    >
      <HStack spacing={4}>
        <HStack spacing={1}>
          <Box w="6px" h="6px" borderRadius="full" bg={colors.statusBar} />
          <Text fontSize="11px" color={colors.fgMuted}>
            {stateLabel(job.current_state)}
          </Text>
        </HStack>
        <Text fontSize="11px" color={colors.fgMuted}>
          Job #{job.id} · {job.job_type === 'YAML_CONVERSION' ? 'Job 1' : 'Job 2'}
        </Text>
      </HStack>
      <HStack spacing={4}>
        {lineCount != null && (
          <Text fontSize="11px" color={colors.fgMuted}>Ln {lineCount}</Text>
        )}
        {charCount != null && (
          <Text fontSize="11px" color={colors.fgMuted}>{charCount} chars</Text>
        )}
        <Text fontSize="11px" color={colors.fgMuted}>{language}</Text>
        <Text fontSize="11px" color={colors.fgMuted}>UTF-8</Text>
        {(() => {
          const provider = job.job_type === 'YAML_CONVERSION' ? job.yaml_llm_provider : job.code_llm_provider;
          if (!provider) return null;
          return (
            <Text
              fontSize="11px"
              color={provider === 'ANTHROPIC' ? '#d97706' : '#3b82f6'}
              fontWeight="medium"
            >
              {provider === 'ANTHROPIC' ? 'Claude' : 'OpenAI'}
            </Text>
          );
        })()}
      </HStack>
    </Flex>
  );
}

// ─── GenerateCTA ──────────────────────────────────────────────────────────────

type LLMProviderChoice = 'OPENAI' | 'ANTHROPIC';

interface GenerateCTAProps {
  job: MigrationJob;
}

function GenerateCTA({ job }: GenerateCTAProps) {
  const colors = useVSColors();
  const navigate  = useNavigate();
  const { user }  = useAuthStore();
  const performer = user?.username ?? 'system';

  const genYAML = useGenerateYAML(job.id);
  const genCode = useGenerateCode(job.id);

  const isJob1 = job.job_type === 'YAML_CONVERSION';
  const label  = isJob1 ? 'Generate YAML' : 'Generate Code';
  const isLoading = genYAML.isPending || genCode.isPending;

  const updateJobProvider = useUpdateJob(job.id);
  const [showProviderModal, setShowProviderModal] = useState(false);
  // Default to the provider stored on the job (set at creation time or last used)
  const defaultProvider: LLMProviderChoice =
    (isJob1 ? job.yaml_llm_provider : job.code_llm_provider) === 'ANTHROPIC'
      ? 'ANTHROPIC'
      : 'OPENAI';
  const [selectedProvider, setSelectedProvider] = useState<LLMProviderChoice>(defaultProvider);

  // Keep the selector in sync when job data is refreshed (e.g. after a PATCH from Job Detail)
  useEffect(() => {
    setSelectedProvider(defaultProvider);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultProvider]);

  // Persist the chosen provider to the job record and update local state
  const handleProviderChange = (provider: LLMProviderChoice) => {
    setSelectedProvider(provider);
    if (isJob1) {
      updateJobProvider.mutate({ yaml_llm_provider: provider });
    } else {
      updateJobProvider.mutate({ code_llm_provider: provider });
    }
  };

  const handleConfirmGenerate = () => {
    setShowProviderModal(false);
    // Persist provider preference before firing generation
    if (isJob1) {
      updateJobProvider.mutate({ yaml_llm_provider: selectedProvider });
      genYAML.mutate({ performed_by: performer, llm_provider: selectedProvider });
    } else if (job.target_language) {
      updateJobProvider.mutate({ code_llm_provider: selectedProvider });
      genCode.mutate({ target_language: job.target_language, performed_by: performer, use_llm: true, llm_provider: selectedProvider });
    }
  };

  return (
    <>
      <VStack flex={1} justify="center" align="center" spacing={5} h="100%" userSelect="none">
        <Icon as={FiFileText as ComponentType} boxSize={14} color={colors.fgMuted} opacity={0.15} />
        <VStack spacing={1}>
          <Text fontSize="16px" color={colors.fg} opacity={0.5} fontWeight="300">
            No content yet
          </Text>
          <Text fontSize="12px" color={colors.fgMuted} opacity={0.45}>
            {isJob1 ? 'Run the LLM to generate YAML from your Pick Basic source' : 'Run the LLM to generate code from the approved YAML'}
          </Text>
        </VStack>
        <Flex gap={3} mt={2}>
          <Button
            size="sm"
            leftIcon={<Icon as={FiPlay as ComponentType} />}
            colorScheme="blue"
            variant="solid"
            isLoading={isLoading}
            onClick={() => setShowProviderModal(true)}
            fontSize="12px"
            h="28px"
          >
            {label}
          </Button>
          <Button
            size="sm"
            leftIcon={<Icon as={FiExternalLink as ComponentType} />}
            variant="outline"
            fontSize="12px"
            h="28px"
            color={colors.fgMuted}
            borderColor={colors.inputBorder}
            _hover={{ color: colors.fgActive, borderColor: colors.fg }}
            onClick={() => navigate(`/jobs/${job.id}`)}
          >
            Open Job Detail
          </Button>
        </Flex>
        {/* Always-visible preferred-provider selector — changes persist to the job record */}
        <HStack spacing={2} opacity={0.7} mt={1}>
          <Text fontSize="11px" color={colors.fgMuted}>AI Provider:</Text>
          <Select
            size="xs" h="22px" fontSize="11px" w="120px"
            value={selectedProvider}
            onChange={(e) => handleProviderChange(e.target.value as LLMProviderChoice)}
            isDisabled={updateJobProvider.isPending}
            sx={{ bg: 'rgba(0,0,0,0.25)', borderColor: colors.inputBorder, color: colors.fg, fontFamily: 'mono' }}
          >
            <option value="OPENAI">OpenAI</option>
            <option value="ANTHROPIC">Anthropic</option>
          </Select>
        </HStack>
      </VStack>

      {/* Provider picker modal */}
      <Modal isOpen={showProviderModal} onClose={() => setShowProviderModal(false)} isCentered size="sm">
        <ModalOverlay bg="blackAlpha.600" />
        <ModalContent bg={colors.sidebar} border="1px solid" borderColor={colors.inputBorder} borderRadius="8px">
          <ModalHeader fontSize="14px" color={colors.fg} borderBottom="1px solid" borderColor={colors.inputBorder} pb={3}>
            Choose AI Provider — {label}
          </ModalHeader>
          <ModalCloseButton color={colors.fgMuted} />
          <ModalBody py={4}>
            <VStack spacing={2}>
              {/* OpenAI option */}
              <Box
                w="100%"
                p={3}
                borderRadius="6px"
                border="2px solid"
                borderColor={selectedProvider === 'OPENAI' ? '#3b82f6' : colors.inputBorder}
                bg={selectedProvider === 'OPENAI' ? 'rgba(59,130,246,0.08)' : 'transparent'}
                cursor="pointer"
                onClick={() => setSelectedProvider('OPENAI')}
                transition="all 0.15s"
                _hover={{ borderColor: '#3b82f6' }}
              >
                <HStack spacing={3}>
                  <Box w="8px" h="8px" borderRadius="full" bg={selectedProvider === 'OPENAI' ? '#3b82f6' : colors.inputBorder} />
                  <VStack align="start" spacing={0}>
                    <Text fontSize="13px" fontWeight="600" color={colors.fg}>OpenAI GPT-4o</Text>
                    <Text fontSize="11px" color={colors.fgMuted}>Reliable structured output, fast responses</Text>
                  </VStack>
                </HStack>
              </Box>

              {/* Anthropic option */}
              <Box
                w="100%"
                p={3}
                borderRadius="6px"
                border="2px solid"
                borderColor={selectedProvider === 'ANTHROPIC' ? '#d97706' : colors.inputBorder}
                bg={selectedProvider === 'ANTHROPIC' ? 'rgba(217,119,6,0.08)' : 'transparent'}
                cursor="pointer"
                onClick={() => setSelectedProvider('ANTHROPIC')}
                transition="all 0.15s"
                _hover={{ borderColor: '#d97706' }}
              >
                <HStack spacing={3}>
                  <Box w="8px" h="8px" borderRadius="full" bg={selectedProvider === 'ANTHROPIC' ? '#d97706' : colors.inputBorder} />
                  <VStack align="start" spacing={0}>
                    <Text fontSize="13px" fontWeight="600" color={colors.fg}>Claude Sonnet</Text>
                    <Text fontSize="11px" color={colors.fgMuted}>Deep reasoning, excellent code understanding</Text>
                  </VStack>
                </HStack>
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter borderTop="1px solid" borderColor={colors.inputBorder} gap={2} pt={3}>
            <Button size="sm" variant="ghost" onClick={() => setShowProviderModal(false)} color={colors.fgMuted} fontSize="12px">
              Cancel
            </Button>
            <Button
              size="sm"
              colorScheme={selectedProvider === 'ANTHROPIC' ? 'orange' : 'blue'}
              leftIcon={<Icon as={FiZap as ComponentType} />}
              onClick={handleConfirmGenerate}
              fontSize="12px"
            >
              {label} with {selectedProvider === 'ANTHROPIC' ? 'Claude' : 'OpenAI'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

// ─── ErrorState ───────────────────────────────────────────────────────────────

function ErrorState({ message }: { message: string }) {
  const colors = useVSColors();
  return (
    <VStack flex={1} justify="center" align="center" spacing={3} h="100%">
      <Icon as={FiAlertTriangle as ComponentType} boxSize={8} color="#fc8181" opacity={0.5} />
      <Text fontSize="13px" color={colors.fgMuted} opacity={0.6}>{message}</Text>
    </VStack>
  );
}

// ─── LoadingState ─────────────────────────────────────────────────────────────

function LoadingState() {
  const colors = useVSColors();
  return (
    <Flex flex={1} justify="center" align="center" h="100%">
      <Spinner size="md" color={colors.fgMuted} thickness="1.5px" />
    </Flex>
  );
}

// ─── ReviewActionsBar ─────────────────────────────────────────────────────────

interface ReviewActionsBarProps {
  isJob2: boolean;
  isPending: boolean;
  versionNum?: number;
  onInstantApprove: () => void;
  onOpenModal: (decision: ReviewDecision) => void;
}

function ReviewActionsBar({ isJob2, isPending, versionNum, onInstantApprove, onOpenModal }: ReviewActionsBarProps) {
  const colors = useVSColors();
  if (isJob2) {
    return (
      <Flex
        h="32px"
        align="center"
        px={3}
        gap={2}
        bg="rgba(0,0,0,0.15)"
        borderBottom={`1px solid ${colors.panelBorder}`}
        flexShrink={0}
      >
        <Text fontSize="10px" color={colors.fgMuted} opacity={0.5} mr={1} userSelect="none">
          Code review:
        </Text>
        <Button
          size="xs"
          h="22px"
          px="10px"
          fontSize="11px"
          leftIcon={<Icon as={FiCheckCircle as ComponentType} boxSize="11px" />}
          colorScheme="teal"
          variant="solid"
          isLoading={isPending}
          onClick={onInstantApprove}
        >
          Accept Code{versionNum ? ` v${versionNum}` : ''}
        </Button>
        <Button
          size="xs"
          h="22px"
          px="10px"
          fontSize="11px"
          leftIcon={<Icon as={FiRotateCcw as ComponentType} boxSize="11px" />}
          colorScheme="red"
          variant="outline"
          isLoading={isPending}
          onClick={() => onOpenModal('CODE_REJECT_REGENERATE')}
          color="#fc8181"
          borderColor="rgba(252,129,129,0.4)"
          _hover={{ bg: 'rgba(252,129,129,0.1)' }}
        >
          Reject Code
        </Button>
      </Flex>
    );
  }

  return (
    <Flex
      h="32px"
      align="center"
      px={3}
      gap={2}
      bg="rgba(0,0,0,0.15)"
      borderBottom={`1px solid ${colors.panelBorder}`}
      flexShrink={0}
    >
      <Text fontSize="10px" color={colors.fgMuted} opacity={0.5} mr={1} userSelect="none">
        YAML review:
      </Text>
      <Button
        size="xs"
        h="22px"
        px="10px"
        fontSize="11px"
        leftIcon={<Icon as={FiCheckCircle as ComponentType} boxSize="11px" />}
        colorScheme="green"
        variant="solid"
        isLoading={isPending}
        onClick={onInstantApprove}
      >
        Approve{versionNum ? ` v${versionNum}` : ''}
      </Button>
      <Button
        size="xs"
        h="22px"
        px="10px"
        fontSize="11px"
        leftIcon={<Icon as={FiMessageCircle as ComponentType} boxSize="11px" />}
        colorScheme="orange"
        variant="outline"
        isLoading={isPending}
        onClick={() => onOpenModal('APPROVE_WITH_COMMENTS')}
        color="#f6ad55"
        borderColor="rgba(246,173,85,0.4)"
        _hover={{ bg: 'rgba(246,173,85,0.08)' }}
      >
        Approve w/ Comments{versionNum ? ` v${versionNum}` : ''}
      </Button>
      <Button
        size="xs"
        h="22px"
        px="10px"
        fontSize="11px"
        leftIcon={<Icon as={FiRotateCcw as ComponentType} boxSize="11px" />}
        colorScheme="red"
        variant="outline"
        isLoading={isPending}
        onClick={() => onOpenModal('REJECT_REGENERATE')}
        color="#fc8181"
        borderColor="rgba(252,129,129,0.4)"
        _hover={{ bg: 'rgba(252,129,129,0.1)' }}
      >
        Reject &amp; Regenerate
      </Button>
    </Flex>
  );
}


// ─── MonacoView ───────────────────────────────────────────────────────────────

interface MonacoViewProps {
  content: string;
  language: string;
  onMetrics?: (lines: number, chars: number) => void;
  /** Pending (unsaved) comments for this tab only */
  pendingLineComments: PendingLineComment[];
  /** Which code surface this editor shows */
  codeType: 'yaml' | 'generated_code';
  onAddLineComment: (c: PendingLineComment) => void;
  /** When true, makes the editor writable and reports changes via onContentChange */
  editMode?: boolean;
  onContentChange?: (newContent: string) => void;
}

/**
 * Glyph-margin CSS injected once into the page.
 * `.lms-comment-dot` renders an amber dot on commented lines.
 */
const GLYPH_CSS = `
  .lms-comment-dot {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .lms-comment-dot::before {
    content: '●';
    color: #f59e0b;
    font-size: 9px;
    line-height: 1;
  }
`;

function MonacoView({ content, language, onMetrics, pendingLineComments, codeType, onAddLineComment, editMode = false, onContentChange }: MonacoViewProps) {
  const colors = useVSColors();
  /* ── refs ─────────────────────────────────────────────────────── */
  const editorRef           = useRef<Parameters<OnMount>[0] | null>(null);
  const decorationsRef      = useRef<ReturnType<Parameters<OnMount>[0]['createDecorationsCollection']> | null>(null);
  const containerRef        = useRef<HTMLDivElement>(null);
  // Tracks whether the pointer is currently over the "+" button overlay so we
  // can avoid clearing hoverLine in the Monaco onMouseMove handler (which would
  // cause the button to flicker on/off while being hovered).
  const isHoveringButton    = useRef(false);
  // Suppresses gutter hover for ~350ms after the form closes so the + button
  // doesn't immediately reappear while the cursor is still over the gutter.
  const suppressHoverRef    = useRef(false);

  /* ── local state ─────────────────────────────────────────────── */
  const [hoverLine,       setHoverLine]       = useState<number | null>(null);
  const [hoverY,          setHoverY]          = useState<number>(0);
  const [commentFormLine, setCommentFormLine] = useState<number | null>(null);
  const [commentFormY,    setCommentFormY]    = useState<number>(0);
  const [commentText,     setCommentText]     = useState('');

  /* ── glyph-margin decorations (amber dot on commented lines) ─── */
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || !decorationsRef.current) return;
    const model = ed.getModel();
    if (!model) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const monacoGlobal = (window as any).monaco;
    if (!monacoGlobal) return;

    decorationsRef.current.set(
      pendingLineComments.map(c => ({
        range: new monacoGlobal.Range(c.lineNumber, 1, c.lineNumber, 1),
        options: {
          glyphMarginClassName: 'lms-comment-dot',
          glyphMarginHoverMessage: { value: `📌 *Line ${c.lineNumber}:* ${c.text}` },
        },
      }))
    );
  }, [pendingLineComments]);

  /* ── handlers ────────────────────────────────────────────────── */
  const openForm = (lineNumber: number, y: number) => {
    setCommentFormLine(lineNumber);
    setCommentFormY(y);
    setHoverLine(null);
    setCommentText('');
  };

  const cancelForm = () => {
    setCommentFormLine(null);
    setCommentText('');
    setHoverLine(null);
    suppressHoverRef.current = true;
    setTimeout(() => { suppressHoverRef.current = false; }, 350);
  };

  const submitComment = () => {
    if (!commentText.trim() || commentFormLine == null) return;
    // Capture the actual code at this line so the LLM has full context
    const codeLine = editorRef.current?.getModel()?.getLineContent(commentFormLine)?.trim();
    onAddLineComment({
      id: crypto.randomUUID(),
      lineNumber: commentFormLine,
      text: commentText.trim(),
      codeLine: codeLine || undefined,
      codeType,
    });
    setCommentText('');
    setCommentFormLine(null);
    setHoverLine(null);
    suppressHoverRef.current = true;
    setTimeout(() => { suppressHoverRef.current = false; }, 350);
  };

  /* ── onMount ─────────────────────────────────────────────────── */
  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;

    // Metrics
    const lineCount = editor.getModel()?.getLineCount() ?? 0;
    onMetrics?.(lineCount, content.length);

    // Decorations collection for glyph margin dots
    decorationsRef.current = editor.createDecorationsCollection([]);

    // Gutter hover → show + button
    //   MouseTargetType.GUTTER_LINE_NUMBERS = 3
    //   MouseTargetType.GUTTER_GLYPH_MARGIN = 2
    editor.onMouseMove((e: Parameters<Parameters<typeof editor.onMouseMove>[0]>[0]) => {
      const { type, position } = e.target as { type: number; position?: { lineNumber: number } };
      if ((type === 3 || type === 2) && position) {
        if (suppressHoverRef.current) return;
        const rect = containerRef.current?.getBoundingClientRect();
        const relY = rect ? e.event.posy - rect.top : e.event.posy;
        setHoverLine(position.lineNumber);
        setHoverY(relY);
      } else if (!isHoveringButton.current) {
        // Only clear when the pointer is NOT over the "+" button overlay;
        // avoids the gutter→button flicker caused by Monaco reporting a
        // non-gutter target as soon as the pointer enters our React overlay.
        setHoverLine(null);
      }
    });

    editor.onMouseLeave(() => {
      if (!isHoveringButton.current) setHoverLine(null);
    });
  };

  /* ── render ──────────────────────────────────────────────────── */
  return (
    <>
      {/* Inject glyph-margin dot CSS once */}
      <Global styles={GLYPH_CSS} />

      <Box ref={containerRef} flex={1} overflow="hidden" minH={0} position="relative">
        <Editor
          height="100%"
          language={language}
          value={content}
          theme="vs-dark"
          options={{
            readOnly: !editMode,
            minimap: { enabled: true, scale: 1 },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontLigatures: true,
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            scrollBeyondLastLine: false,
            wordWrap: 'off',
            smoothScrolling: true,
            cursorBlinking: 'blink',
            folding: true,
            glyphMargin: true,   // ← enabled for comment dots + hover button
            contextmenu: !editMode ? false : true,
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
              verticalScrollbarSize: 6,
              horizontalScrollbarSize: 6,
            },
            padding: { top: 8 },
            domReadOnly: !editMode,
          }}
          onChange={editMode ? (val) => { if (onContentChange) onContentChange(val ?? ''); } : undefined}
          onMount={handleMount}
        />

        {/* ── + button: shown when hovering a gutter line number ── */}
        {hoverLine != null && commentFormLine == null && (
          <Box
            position="absolute"
            left="2px"
            top={`${hoverY - 10}px`}
            zIndex={10}
            w="20px"
            h="20px"
            borderRadius="3px"
            bg={colors.statusBar}
            display="flex"
            alignItems="center"
            justifyContent="center"
            cursor="pointer"
            onClick={() => openForm(hoverLine, hoverY)}
            onMouseEnter={() => { isHoveringButton.current = true; }}
            onMouseLeave={() => { isHoveringButton.current = false; setHoverLine(null); }}
            _hover={{ bg: '#005fa3' }}
            userSelect="none"
            fontSize="16px"
            fontWeight="300"
            color="white"
            lineHeight="1"
            title={`Add comment on line ${hoverLine}`}
          >
            +
          </Box>
        )}

        {/* ── Inline comment form — pure React overlay (no view zone portal) ── */}
        {commentFormLine != null && (
          <Box
            position="absolute"
            left="50px"
            right="10px"
            top={`${commentFormY + 4}px`}
            zIndex={20}
            bg={colors.panel}
            border={`1px solid ${colors.statusBar}`}
            borderRadius="6px"
            p="8px"
            display="flex"
            flexDirection="column"
            gap="6px"
            boxShadow="0 4px 16px rgba(0,0,0,0.55)"
            // Stop click events from reaching Monaco (which would steal focus)
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            <Text fontSize="11px" color="#66b3e8" fontFamily="mono" userSelect="none">
              ＃L{commentFormLine}
            </Text>
            <textarea
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Add a comment…"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '4px',
                color: '#cccccc',
                fontSize: '12px',
                fontFamily: 'inherit',
                padding: '5px 7px',
                resize: 'none',
                height: '36px',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); }
                if (e.key === 'Escape') cancelForm();
              }}
            />
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button
                onClick={cancelForm}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#888',
                  borderRadius: '3px',
                  padding: '2px 10px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={submitComment}
                style={{
                  background: commentText.trim() ? '#007acc' : '#444',
                  border: 'none',
                  color: commentText.trim() ? 'white' : '#888',
                  borderRadius: '3px',
                  padding: '2px 10px',
                  fontSize: '11px',
                  cursor: commentText.trim() ? 'pointer' : 'default',
                }}
              >
                Add
              </button>
            </div>
          </Box>
        )}
      </Box>
    </>
  );
}


// ─── JobEditor ────────────────────────────────────────────────────────────────

interface JobEditorProps {
  jobId: number;
  pendingLineComments: PendingLineComment[];
  onAddLineComment: (c: PendingLineComment) => void;
  onClearLineComments: () => void;
}

function JobEditor({ jobId, pendingLineComments, onAddLineComment, onClearLineComments }: JobEditorProps) {
  const colors   = useVSColors();
  const navigate   = useNavigate();
  const qc         = useQueryClient();
  const { user }   = useAuthStore();
  const performer  = user?.username ?? 'system';

  const [activeTab, setActiveTab] = useState<EditorTab>('yaml');
  const [metrics,   setMetrics]   = useState<{ lines: number; chars: number } | null>(null);
  const [showDiff,  setShowDiff]  = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [splitLeftPx, setSplitLeftPx] = useState(480);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  // Version diff panel
  const [showVersionDiff, setShowVersionDiff] = useState(false);
  // Override content (set when user applies a version diff merge or manually edits)
  const [overrideContent, setOverrideContent] = useState<string | null>(null);
  // Edit mode (Phase 8: manual editing)
  const [editMode, setEditMode] = useState(false);
  // Version switcher — which historical version is currently selected (null = latest)
  const [selectedYAMLVersionNum, setSelectedYAMLVersionNum] = useState<number | null>(null);
  const [selectedCodeVersionNum, setSelectedCodeVersionNum] = useState<number | null>(null);
  // Auto-label carried from diff-apply to the subsequent save
  const [pendingEditLabel, setPendingEditLabel] = useState<string | null>(null);

  const handleSplitResize = useCallback((delta: number) => {
    setSplitLeftPx(prev => {
      const containerWidth = splitContainerRef.current?.clientWidth ?? 960;
      return Math.max(200, Math.min(containerWidth - 200, prev + delta));
    });
  }, []);

  // Review modal state
  const [reviewModalDecision, setReviewModalDecision] = useState<ReviewDecision | null>(null);
  const [generalComment,      setGeneralComment]      = useState('');
  // Syntax error panel — dismissed per session so the user isn't constantly shown it
  const [syntaxErrorsDismissed, setSyntaxErrorsDismissed] = useState(false);
  // Track which generatedCode.id the dismissal belongs to; reset when code is regenerated
  const [syntaxErrorsDismissedForId, setSyntaxErrorsDismissedForId] = useState<number | null>(null);

  const { data: job, isLoading: jobLoading, isError: jobError } = useJob(jobId);

  // For Job 2 we also need the parent job for its YAML tab
  const isJob2       = job?.job_type === 'CODE_CONVERSION';
  const parentJobId  = job?.parent_job_id ?? null;

  // useParentJob takes the Job 2 ID and returns the parent Job 1
  const { data: parentJob }  = useParentJob(isJob2 ? jobId : 0);

  // YAML content: Job 1 → from this job; Job 2 → from parent job
  const yamlSourceId = isJob2 ? (parentJobId ?? 0) : jobId;
  const {
    data: yamlVersion,
    isLoading: yamlLoading,
    isError: yamlError,
  } = useLatestYAML(yamlSourceId, false);

  // Code content: only for Job 2
  const {
    data: generatedCode,
    isLoading: codeLoading,
    isError: codeError,
  } = useGeneratedCode(isJob2 ? jobId : 0);

  // Source code for diff view
  const { data: jobWithSource } = useJobWithSource(isJob2 ? (parentJobId ?? 0) : jobId);

  // Review submission + line comment saving
  const submitReview   = useSubmitReview(jobId);
  const addLineComment = useAddLineComment(jobId);
  // Cancel regeneration request — transitions *_REGENERATE_REQUESTED → *_UNDER_REVIEW
  const cancelRegen    = useTransitionJob(jobId);
  // Manual edit mutations (legacy — kept for reference; save now uses createVersion)
  const editYAML = useEditYAMLVersion(yamlSourceId);
  const editCode = useEditCode(jobId);
  // Version lists for switcher dropdown
  const { data: yamlVersionsList } = useYAMLVersions(yamlSourceId, true);
  const { data: codeVersionsList  } = useCodeVersions(isJob2 ? jobId : 0);
  // Specific historical version content (when version switcher is used)
  const { data: specificYAMLVersion, isLoading: specificYAMLLoading } = useYAMLVersion(yamlSourceId, selectedYAMLVersionNum ?? 0);
  const { data: specificCodeVersion, isLoading: specificCodeLoading  } = useCodeVersion(isJob2 ? jobId : 0, selectedCodeVersionNum);
  // Create-new-version mutations (saves as a new DB row; never overwrites)
  const createYAMLVersion = useCreateYAMLVersion(yamlSourceId);
  const createCodeVersion = useCreateCodeVersion(jobId);

  // ── Generation overlay detection ─────────────────────────────────────────
  const isGeneratingYAML = useIsMutating({ mutationKey: ['generate-yaml', jobId] }) > 0;
  const isGeneratingCode = useIsMutating({ mutationKey: ['generate-code', jobId] }) > 0;
  const isGenerating     = isGeneratingYAML || isGeneratingCode;

  // ── Studio-approve (approve any YAML version regardless of job state) ────
  // Derived: which YAML version is currently visible in the editor?
  const activeYAMLVersionNum = selectedYAMLVersionNum ?? (yamlVersion?.version_number ?? 0);
  const activeCodeVersionNum = selectedCodeVersionNum ?? (generatedCode?.version_number ?? 0);
  const activeYAMLIsApproved = selectedYAMLVersionNum
    ? (specificYAMLVersion?.is_approved ?? false)
    : (yamlVersion?.is_approved ?? false);
  // Hook must be called unconditionally (React rules)
  const approveYAMLVersion = useApproveYAML(yamlSourceId, activeYAMLVersionNum);

  // ── Tab definitions ──────────────────────────────────────────────────────
  const tabs: Array<{ id: EditorTab; label: string; color: string }> = [
    {
      id:    'yaml',
      label: job ? yamlFilename(job) : 'schema.yaml',
      color: '#e89d47',
    },
    ...(isJob2
      ? [{
          id:    'code' as EditorTab,
          label: codeFilename(job!),
          color: job?.target_language ? LANG_COLOR[job.target_language] : '#cccccc',
        }]
      : []),
  ];

  // After job 2 loads, default to code tab if YAML tab wasn't explicitly chosen
  if (isJob2 && activeTab === 'yaml' && !yamlVersion && generatedCode) {
    setActiveTab('code');
  }

  // ── Breadcrumb ───────────────────────────────────────────────────────────
  const activeTabDef = tabs.find((t) => t.id === activeTab);
  const breadcrumbs  = ['MIGRATION', job?.source_filename ?? `Job #${jobId}`, activeTabDef?.label ?? ''].filter(Boolean);

  // ── Content resolution ────────────────────────────────────────────────────
  const showContent = (() => {
    if (activeTab === 'yaml') {
      if (yamlLoading) return 'loading';
      if (yamlError || !yamlVersion) return 'generate';
      // If the user selected a specific (historical) version, wait for it to load
      if (selectedYAMLVersionNum && specificYAMLLoading) return 'loading';
      if (selectedYAMLVersionNum && !specificYAMLVersion) return 'loading';
      return 'content';
    } else {
      if (codeLoading) return 'loading';
      if (codeError || !generatedCode) return 'generate';
      // If the user selected a specific (historical) version, wait for it to load
      if (selectedCodeVersionNum && specificCodeLoading) return 'loading';
      if (selectedCodeVersionNum && !specificCodeVersion) return 'loading';
      return 'content';
    }
  })();

  const content      = overrideContent ?? (activeTab === 'yaml'
    ? (selectedYAMLVersionNum ? (specificYAMLVersion?.yaml_content ?? '') : (yamlVersion?.yaml_content ?? ''))
    : (selectedCodeVersionNum ? (specificCodeVersion?.code_content  ?? '') : (generatedCode?.code_content ?? '')));
  const monacoLang   = activeTab === 'yaml' ? 'yaml' : monacoLanguage(job?.target_language ?? 'PYTHON');
  const languageName = activeTab === 'yaml' ? 'YAML' : languageLabel(job?.target_language ?? null);

  // Approve-YAML bar removed — standard approval flows are sufficient
  // const showApproveYAMLBar = ...

  // Next-version number shown on the draft commit button
  const nextYAMLVersionNum = yamlVersionsList && yamlVersionsList.length > 0
    ? Math.max(...yamlVersionsList.map(v => v.version_number)) + 1
    : (yamlVersion?.version_number ?? 0) + 1;
  const nextCodeVersionNum = codeVersionsList && codeVersionsList.length > 0
    ? Math.max(...codeVersionsList.map(v => v.version_number ?? 0)) + 1
    : ((generatedCode as any)?.version_number ?? 0) + 1;
  const nextVersionNum = activeTab === 'yaml' ? nextYAMLVersionNum : nextCodeVersionNum;

  // Commit the in-browser draft as a new DB version
  const handleCommitDraft = async () => {
    if (!overrideContent) return;
    const editReason = pendingEditLabel ?? 'Manual edit';
    if (activeTab === 'yaml') {
      await createYAMLVersion.mutateAsync({
        yaml_content: overrideContent,
        edited_by: performer,
        edit_reason: editReason,
      });
    } else {
      await createCodeVersion.mutateAsync({
        code_content: overrideContent,
        edited_by: performer,
        edit_reason: editReason,
      });
    }
    setOverrideContent(null);
    setEditMode(false);
    setPendingEditLabel(null);
    setSelectedYAMLVersionNum(null);
    setSelectedCodeVersionNum(null);
  };

  // ── Diff content ──────────────────────────────────────────────────────────
  // YAML tab: Pick Basic source → YAML  │  Code tab: YAML → generated code
  const diffOriginal     = activeTab === 'yaml'
    ? (jobWithSource?.original_source_code ?? '')
    : (yamlVersion?.yaml_content ?? '');
  const diffModified     = content;
  const diffOriginalLang = activeTab === 'yaml' ? 'plaintext' : 'yaml';
  const diffModifiedLang = monacoLang;

  // ── Guards ────────────────────────────────────────────────────────────────
  if (jobLoading) return <LoadingState />;
  if (jobError || !job) return <ErrorState message={`Could not load job #${jobId}`} />;

  // ── Review helpers ────────────────────────────────────────────────────────
  const reviewableYAML = job.current_state === 'YAML_GENERATED' || job.current_state === 'UNDER_REVIEW';
  const reviewableCode = job.current_state === 'CODE_GENERATED'  || job.current_state === 'CODE_UNDER_REVIEW';
  const showReviewBar  = showContent === 'content' && (reviewableYAML || reviewableCode);

  // Post-approval CTAs (placed after showReviewBar to avoid temporal dead zone)
  const showGenerateCodeCTA = showContent === 'content'
    && activeTab === 'yaml'
    && !isJob2
    && activeYAMLIsApproved
    && activeYAMLVersionNum > 0
    && !showReviewBar;
  const showDownloadCodeCTA = showContent === 'content'
    && activeTab === 'code'
    && isJob2
    && !!(generatedCode?.is_accepted)
    && !showReviewBar;

  const handleReview = async (decision: ReviewDecision, comment?: string) => {
    // Use the DB id of the version currently displayed, not always the latest.
    // For YAML tab: prefer specificYAMLVersion (when user has picked a specific version)
    //               fall back to yamlVersion (the latest, when no explicit selection).
    // For Code tab: use the yaml_version_id associated with the current code entry.
    const versionId = activeTab === 'yaml'
      ? (specificYAMLVersion?.id ?? yamlVersion?.id ?? 0)
      : (generatedCode?.yaml_version_id ?? 0);
    // Save pending line comments first
    for (const lc of pendingLineComments) {
      const payload: LineCommentCreate = {
        line_number: lc.lineNumber,
        code_type: lc.codeType,
        comment: lc.text,
        reviewer: performer,
      };
      await addLineComment.mutateAsync(payload);
    }
    // Build review comment list from pending comments
    const reviewComments = pendingLineComments.map(lc => ({
      section: `L${lc.lineNumber} (${lc.codeType})`,
      comment_text: lc.text,
      severity: 'info' as const,
    }));
    submitReview.mutate(
      {
        data: {
          yaml_version_id: versionId,
          decision,
          ...(comment ? { general_comment: comment } : {}),
          ...(reviewComments.length ? { comments: reviewComments } : {}),
        },
        performedBy: performer,
      },
      {
        onSuccess: () => {
          // For Job 2, useSubmitReview invalidates ['yaml', jobId] (Job 2 ID) but
          // the YAML panel actually queries the *parent* job's YAML. Force-invalidate
          // the parent's YAML so the Studio reflects the approved state immediately.
          if (isJob2 && parentJobId) {
            qc.invalidateQueries({ queryKey: YAML_KEYS.all(parentJobId) });
          }
          onClearLineComments();
          setGeneralComment('');
          setReviewModalDecision(null);
        },
      }
    );
  };

  return (
    <Flex direction="column" h="100%" overflow="hidden" position="relative">
      {/* Generation Processing Overlay */}
      {isGenerating && (
        <GenerationProcessingOverlay
          type={isGeneratingCode ? 'code' : 'yaml'}
          language={job?.target_language}
        />
      )}
      {/* Tab Bar */}
      <Flex
        bg={colors.tabBar}
        borderBottom={`1px solid ${colors.panelBorder}`}
        align="flex-end"
        flexShrink={0}
        overflow="hidden"
      >
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            label={tab.label}
            iconColor={tab.color}
            isActive={activeTab === tab.id}
            onClick={() => {
                setActiveTab(tab.id);
                setMetrics(null);
                setOverrideContent(null);
                setEditMode(false);
                setShowVersionDiff(false);
                setSelectedYAMLVersionNum(null);
                setSelectedCodeVersionNum(null);
                setPendingEditLabel(null);
              }}
          />
        ))}

        {/* Spacer + action buttons */}
        <Flex flex={1} justify="flex-end" align="center" pr={2} pb="1px" gap="2px">
          {/* ── Version switcher ─────────────────────────────────────────── */}
          {showContent === 'content' && (() => {
            const vList = activeTab === 'yaml'
              ? (yamlVersionsList ?? []).map(v => ({
                  num: v.version_number,
                  label: `v${v.version_number}${v.is_approved ? ' ✓' : ''}`,
                }))
              : (codeVersionsList ?? []).map(v => ({
                  num: v.version_number ?? 0,
                  label: `v${v.version_number}${v.is_accepted ? ' ✓' : (v.is_current ? ' ●' : '')}`,
                }));
            const activeVNum = activeTab === 'yaml' ? selectedYAMLVersionNum : selectedCodeVersionNum;
            const latestNum  = vList[0]?.num ?? null;   // list is newest-first
            const displayVal = activeVNum ?? latestNum ?? '';
            if (vList.length < 2) return null; // no switcher when only one version
            return (
              <Tooltip
                label={`Switch to a different version (viewing ${activeVNum ? `v${activeVNum}` : 'latest'})`}
                hasArrow placement="bottom" openDelay={500}
              >
                <Select
                  size="xs"
                  value={displayVal}
                  onChange={e => {
                    const vn = Number(e.target.value);
                    const goLatest = vn === latestNum;
                    if (activeTab === 'yaml') setSelectedYAMLVersionNum(goLatest ? null : vn);
                    else setSelectedCodeVersionNum(goLatest ? null : vn);
                    setOverrideContent(null);
                    setEditMode(false);
                    setPendingEditLabel(null);
                  }}
                  w="68px"
                  bg={colors.input}
                  borderColor={activeVNum ? '#7c3aed' : colors.inputBorder}
                  color={activeVNum ? '#c4b5fd' : colors.fg}
                  fontSize="10px"
                  h="22px"
                  flexShrink={0}
                  _hover={{ borderColor: '#7c3aed' }}
                >
                  {vList.map(v => (
                    <option key={v.num} value={v.num}>{v.label}</option>
                  ))}
                </Select>
              </Tooltip>
            );
          })()}
          {/* Diff toggle — only when content is loaded */}
          {showContent === 'content' && (
            <Tooltip label={showDiff ? 'Hide diff' : 'Show diff (source → output)'} hasArrow placement="bottom" openDelay={500}>
              <IconButton
                aria-label="Toggle diff view"
                icon={<Icon as={FiGitMerge as ComponentType} boxSize="12px" />}
                size="xs" variant={showDiff ? 'solid' : 'ghost'}
                colorScheme={showDiff ? 'blue' : undefined}
                color={showDiff ? undefined : colors.fgMuted}
                bg={showDiff ? '#005fa3' : undefined}
                _hover={{ color: colors.fgActive, bg: showDiff ? '#007acc' : colors.hover }}
                minW="22px" h="22px"
                onClick={() => { setShowDiff(v => !v); if (showSplit) setShowSplit(false); }}
              />
            </Tooltip>
          )}
          {/* Split view toggle — only when content is loaded and not in diff mode */}
          {showContent === 'content' && !showDiff && (
            <Tooltip
              label={showSplit ? 'Close split view' : (isJob2 ? 'Split: YAML ↔ Code' : 'Split: Source ↔ YAML')}
              hasArrow placement="bottom" openDelay={500}
            >
              <IconButton
                aria-label="Toggle split view"
                icon={<Icon as={FiColumns as ComponentType} boxSize="12px" />}
                size="xs" variant={showSplit ? 'solid' : 'ghost'}
                colorScheme={showSplit ? 'teal' : undefined}
                color={showSplit ? undefined : colors.fgMuted}
                bg={showSplit ? '#147a6e' : undefined}
                _hover={{ color: colors.fgActive, bg: showSplit ? '#0d9488' : colors.hover }}
                minW="22px" h="22px"
                onClick={() => setShowSplit(v => !v)}
              />
            </Tooltip>
          )}
          {/* Edit mode toggle — Save/Discard moved to draft ribbon below */}
          {showContent === 'content' && !showDiff && !showSplit && (
            <Tooltip
              label={editMode ? 'Exit edit mode (changes stay in draft)' : 'Edit content manually'}
              hasArrow placement="bottom" openDelay={500}
            >
              <IconButton
                aria-label={editMode ? 'Exit edit mode' : 'Edit mode'}
                icon={<Icon as={FiEdit as ComponentType} boxSize="12px" />}
                size="xs"
                variant={editMode ? 'solid' : 'ghost'}
                colorScheme={editMode ? 'orange' : undefined}
                color={editMode ? undefined : colors.fgMuted}
                _hover={{ color: editMode ? undefined : colors.fgActive, bg: editMode ? undefined : colors.hover }}
                minW="22px" h="22px"
                onClick={() => setEditMode(v => !v)}
              />
            </Tooltip>
          )}
          {showContent === 'content' && !showDiff && !showSplit && (
            <Tooltip
              label={showVersionDiff ? 'Close version diff' : 'Compare versions (GitHub-style diff)'}
              hasArrow placement="bottom" openDelay={500}
            >
              <IconButton
                aria-label="Toggle version diff"
                icon={<Icon as={FiGitCommit as ComponentType} boxSize="12px" />}
                size="xs" variant={showVersionDiff ? 'solid' : 'ghost'}
                colorScheme={showVersionDiff ? 'purple' : undefined}
                color={showVersionDiff ? undefined : colors.fgMuted}
                bg={showVersionDiff ? '#5a2d82' : undefined}
                _hover={{ color: colors.fgActive, bg: showVersionDiff ? '#7c3aed' : colors.hover }}
                minW="22px" h="22px"
                onClick={() => setShowVersionDiff(v => !v)}
              />
            </Tooltip>
          )}
          <Tooltip label="Open in Job Detail" hasArrow placement="bottom" openDelay={500}>
            <IconButton
              aria-label="Open Job Detail"
              icon={<Icon as={FiExternalLink as ComponentType} boxSize="12px" />}
              size="xs" variant="ghost"
              color={colors.fgMuted}
              _hover={{ color: colors.fgActive, bg: colors.hover }}
              minW="22px" h="22px"
              onClick={() => navigate(`/jobs/${jobId}`)}
            />
          </Tooltip>
          {activeTab === 'code' && generatedCode && (
            <Tooltip label="Download" hasArrow placement="bottom" openDelay={500}>
              <IconButton
                aria-label="Download code"
                icon={<Icon as={FiDownload as ComponentType} boxSize="12px" />}
                size="xs" variant="ghost"
                color={colors.fgMuted}
                _hover={{ color: colors.fgActive, bg: colors.hover }}
                minW="22px" h="22px"
                as="a"
                href={codeApi.downloadUrl(jobId)}
                download
              />
            </Tooltip>
          )}
        </Flex>
      </Flex>

      {/* Breadcrumb */}
      <BreadcrumbBar segments={breadcrumbs} />

      {/* State badge strip */}
      <Flex
        h="26px"
        align="center"
        px={3}
        gap={2}
        bg={colors.editor}
        borderBottom={`1px solid ${colors.sidebarBorder}`}
        flexShrink={0}
      >
        <Badge
          fontSize="10px"
          px="6px"
          py="1px"
          borderRadius="3px"
          bg={
            job.current_state.includes('APPROVED')  ? 'teal.700'  :
            job.current_state.includes('CODE')       ? '#4a1d96'  :
            job.current_state === 'COMPLETED'        ? 'green.700' :
            job.current_state === 'YAML_APPROVED_QUEUED' ? 'cyan.800' :
            job.current_state === 'CREATED'          ? 'gray.600'  : '#7a4a00'
          }
          color="white"
          textTransform="none"
          fontWeight="medium"
        >
          {stateLabel(job.current_state)}
        </Badge>
        {job.target_language && (
          <Badge
            fontSize="10px"
            px="6px" py="1px"
            borderRadius="3px"
            bg="gray.700"
            color={LANG_COLOR[job.target_language]}
            textTransform="none"
          >
            {languageLabel(job.target_language)}
          </Badge>
        )}
        {isJob2 && parentJob && (
          <Badge
            fontSize="10px"
            px="6px" py="1px"
            borderRadius="3px"
            bg="gray.700"
            color={colors.fgMuted}
            textTransform="none"
            cursor="pointer"
            onClick={() => navigate(`/jobs/${parentJob.id}`)}
            _hover={{ color: colors.fg }}
          >
            ↑ Job 1 #{parentJob.id}
          </Badge>
        )}
      </Flex>

      {/* Review actions bar */}
      {showReviewBar && (
        <ReviewActionsBar
          isJob2={isJob2}
          isPending={submitReview.isPending || addLineComment.isPending}
          versionNum={isJob2 ? activeCodeVersionNum : activeYAMLVersionNum}
          onInstantApprove={() => handleReview(isJob2 ? 'CODE_APPROVE' : 'APPROVE')}
          onOpenModal={(d) => { setReviewModalDecision(d); setGeneralComment(''); }}
        />
      )}

      {/* Post-approval: Job 1 YAML approved — offer to send to code generation */}
      {showGenerateCodeCTA && (
        <Flex
          align="center"
          justify="space-between"
          px={4}
          py="6px"
          bg="rgba(34,197,94,0.10)"
          borderBottom="1px solid rgba(34,197,94,0.28)"
          flexShrink={0}
          gap={3}
        >
          <Flex align="center" gap={2}>
            <Icon as={FiCheckCircle as ComponentType} color="green.300" boxSize="14px" />
            <Text fontSize="12px" color="green.200" fontWeight="medium">
              YAML v{activeYAMLVersionNum} is approved
            </Text>
            <Text fontSize="11px" color={colors.fgMuted}>
              — ready to send to code generation agent
            </Text>
          </Flex>
          <HStack spacing={2}>
            <Tooltip label="Open job detail to trigger code generation for each target language" hasArrow placement="top">
              <Button
                size="xs"
                colorScheme="green"
                bg="green.700"
                _hover={{ bg: 'green.600' }}
                leftIcon={<Icon as={FiZap as ComponentType} boxSize="10px" />}
                onClick={() => navigate(`/jobs/${jobId}`)}
              >
                Go to Code Generation Jobs
              </Button>
            </Tooltip>
          </HStack>
        </Flex>
      )}

      {/* Post-approval: Job 2 code accepted — prominent download CTA */}
      {showDownloadCodeCTA && (
        <Flex
          align="center"
          justify="space-between"
          px={4}
          py="6px"
          bg="rgba(34,197,94,0.10)"
          borderBottom="1px solid rgba(34,197,94,0.28)"
          flexShrink={0}
          gap={3}
        >
          <Flex align="center" gap={2}>
            <Icon as={FiCheckCircle as ComponentType} color="green.300" boxSize="14px" />
            <Text fontSize="12px" color="green.200" fontWeight="medium">
              Code is accepted
            </Text>
            <Text fontSize="11px" color={colors.fgMuted}>
              — download the final {job?.target_language ?? 'target'} source file
            </Text>
          </Flex>
          <HStack spacing={2}>
            <Button
              size="xs"
              colorScheme="green"
              bg="green.700"
              _hover={{ bg: 'green.600' }}
              leftIcon={<Icon as={FiDownload as ComponentType} boxSize="10px" />}
              as="a"
              href={codeApi.downloadUrl(jobId)}
              download
            >
              Download {job?.target_language ?? 'Code'}
            </Button>
          </HStack>
        </Flex>
      )}

      {/* YAML Regeneration Requested banner — cancel puts job back to UNDER_REVIEW */}
      {job.current_state === 'REGENERATE_REQUESTED' && showContent === 'content' && (
        <Flex
          align="center" justify="space-between" px={4} py="6px"
          bg="rgba(234,179,8,0.10)" borderBottom="1px solid rgba(234,179,8,0.28)"
          flexShrink={0} gap={3}
        >
          <Flex align="center" gap={2}>
            <Icon as={FiRotateCcw as ComponentType} color="yellow.300" boxSize="13px" />
            <Text fontSize="12px" color="yellow.200" fontWeight="medium">YAML Regeneration Requested</Text>
            <Text fontSize="11px" color={colors.fgMuted}>
              — reviewer requested a new version. Run the LLM to regenerate, or cancel to go back to review.
            </Text>
          </Flex>
          <Button
            size="xs" h="22px" px="10px" fontSize="11px"
            leftIcon={<Icon as={FiXCircle as ComponentType} boxSize="11px" />}
            colorScheme="gray" variant="outline"
            color={colors.fgMuted}
            borderColor="rgba(156,163,175,0.4)"
            _hover={{ bg: 'rgba(156,163,175,0.1)', color: colors.fg }}
            isLoading={cancelRegen.isPending}
            onClick={() => cancelRegen.mutate({ new_state: 'UNDER_REVIEW', reason: 'Regeneration request cancelled by user' })}
          >
            Cancel Regeneration
          </Button>
        </Flex>
      )}

      {/* Code Regeneration Requested banner — cancel puts job back to CODE_UNDER_REVIEW */}
      {job.current_state === 'CODE_REGENERATE_REQUESTED' && showContent === 'content' && (
        <Flex
          align="center" justify="space-between" px={4} py="6px"
          bg="rgba(234,179,8,0.10)" borderBottom="1px solid rgba(234,179,8,0.28)"
          flexShrink={0} gap={3}
        >
          <Flex align="center" gap={2}>
            <Icon as={FiRotateCcw as ComponentType} color="yellow.300" boxSize="13px" />
            <Text fontSize="12px" color="yellow.200" fontWeight="medium">Code Regeneration Requested</Text>
            <Text fontSize="11px" color={colors.fgMuted}>
              — reviewer requested new code. Run the LLM to regenerate, or cancel to go back to review.
            </Text>
          </Flex>
          <Button
            size="xs" h="22px" px="10px" fontSize="11px"
            leftIcon={<Icon as={FiXCircle as ComponentType} boxSize="11px" />}
            colorScheme="gray" variant="outline"
            color={colors.fgMuted}
            borderColor="rgba(156,163,175,0.4)"
            _hover={{ bg: 'rgba(156,163,175,0.1)', color: colors.fg }}
            isLoading={cancelRegen.isPending}
            onClick={() => cancelRegen.mutate({ new_state: 'CODE_UNDER_REVIEW', reason: 'Regeneration request cancelled by user' })}
          >
            Cancel Regeneration
          </Button>
        </Flex>
      )}

      {/* Syntax Error Warning — shown when auto-fix retry still left errors */}
      {(() => {
        if (activeTab !== 'code') return null;
        const errors = generatedCode?.validation_errors;
        if (!errors || errors.length === 0) return null;
        // Dismiss is scoped to the current code record; reset automatically on next generation
        const isDismissed = syntaxErrorsDismissedForId === generatedCode?.id;
        if (isDismissed) return null;
        const toolAvailable = generatedCode?.validation_tool_available ?? false;
        return (
          <Box
            px={4} py="8px"
            bg="rgba(239,68,68,0.10)"
            borderBottom="1px solid rgba(239,68,68,0.28)"
            flexShrink={0}
          >
            <Flex align="flex-start" justify="space-between" gap={3}>
              <Flex align="flex-start" gap={2} flex={1} direction="column">
                <Flex align="center" gap={2}>
                  <Icon as={FiAlertTriangle as ComponentType} color="red.400" boxSize="13px" flexShrink={0} />
                  <Text fontSize="12px" color="red.300" fontWeight="semibold">
                    Syntax {errors.length === 1 ? 'Error' : 'Errors'} Detected
                    {!toolAvailable && (
                      <Text as="span" fontWeight="normal" color="red.400" ml={1}>(heuristic check)</Text>
                    )}
                  </Text>
                  <Text fontSize="11px" color={colors.fgMuted}>
                    — The LLM auto-fix already ran once. Use <Text as="span" color="orange.300" fontWeight="medium">Edit Mode</Text> (pencil icon ↑) to correct manually.
                  </Text>
                </Flex>
                <VStack align="flex-start" spacing="2px" pl={5} w="100%">
                  {errors.map((err, i) => (
                    <Text key={i} fontSize="11px" color="red.300" fontFamily="mono">
                      {err}
                    </Text>
                  ))}
                </VStack>
              </Flex>
              <IconButton
                aria-label="Dismiss syntax errors"
                icon={<Icon as={FiX as ComponentType} boxSize="11px" />}
                size="xs" variant="ghost"
                color={colors.fgMuted}
                _hover={{ color: colors.fg }}
                minW="20px" h="20px" flexShrink={0}
                onClick={() => setSyntaxErrorsDismissedForId(generatedCode?.id ?? null)}
              />
            </Flex>
          </Box>
        );
      })()}

      {/* Draft ribbon — visible whenever there are uncommitted changes */}
      {overrideContent !== null && showContent === 'content' && !showDiff && !showSplit && (
        <Flex
          align="center"
          justify="space-between"
          px={4}
          py="6px"
          bg="rgba(234,179,8,0.10)"
          borderBottom="1px solid rgba(234,179,8,0.28)"
          flexShrink={0}
          gap={3}
        >
          <Flex align="center" gap={2}>
            <Icon as={FiGitBranch as ComponentType} color="yellow.300" boxSize="13px" />
            <Text fontSize="12px" color="yellow.200" fontWeight="medium">Unsaved draft</Text>
            <Text fontSize="11px" color={colors.fgMuted}>· {pendingEditLabel ?? 'Manual edit'}</Text>
            {editMode && (
              <Badge colorScheme="orange" fontSize="9px" px={1.5} py={0.5} borderRadius="3px">
                Editing
              </Badge>
            )}
          </Flex>
          <HStack spacing={2}>
            <Text fontSize="10px" color={colors.fgMuted}>→ will save as v{nextVersionNum}</Text>
            <Tooltip label={`Write all draft changes to database as version ${nextVersionNum}`} hasArrow placement="top">
              <Button
                size="xs"
                colorScheme="yellow"
                leftIcon={<Icon as={FiGitBranch as ComponentType} boxSize="10px" />}
                isLoading={createYAMLVersion.isPending || createCodeVersion.isPending}
                onClick={handleCommitDraft}
              >
                Commit as v{nextVersionNum}
              </Button>
            </Tooltip>
            <Tooltip label="Discard all unsaved draft changes" hasArrow placement="top">
              <IconButton
                aria-label="Discard draft"
                icon={<Icon as={FiX as ComponentType} boxSize="11px" />}
                size="xs"
                variant="ghost"
                color="#fc8181"
                _hover={{ bg: 'rgba(252,129,129,0.12)' }}
                minW="22px" h="22px"
                onClick={() => { setOverrideContent(null); setEditMode(false); setPendingEditLabel(null); }}
              />
            </Tooltip>
          </HStack>
        </Flex>
      )}

      {/* Main content */}
      {showContent === 'loading' && <LoadingState />}
      {showContent === 'generate' && <GenerateCTA job={job} />}

      {/* Split view: source ↔ output side-by-side with draggable divider */}
      {showContent === 'content' && !showDiff && showSplit && (
        <Flex ref={splitContainerRef} flex={1} overflow="hidden" minH={0}>
          {/* Left pane — "input" to this conversion step */}
          <Box
            style={{ width: `${splitLeftPx}px`, minWidth: '200px' }}
            overflow="hidden"
            flexShrink={0}
            borderRight={`1px solid ${colors.panelBorder}`}
            position="relative"
            display="flex"
            flexDirection="column"
          >
            {/* Left pane label */}
            <Box
              position="absolute"
              top={0}
              left={0}
              right={0}
              h="20px"
              bg="rgba(0,0,0,0.35)"
              display="flex"
              alignItems="center"
              px={2}
              zIndex={5}
              pointerEvents="none"
            >
              <Text fontSize="10px" color={colors.fgMuted} fontFamily="mono" userSelect="none">
                {activeTab === 'yaml'
                  ? `📄 ${job.source_filename ?? 'source.pick'} — original source`
                  : '📋 schema.yaml — YAML reference'}
              </Text>
            </Box>
            <MonacoView
              content={
                activeTab === 'yaml'
                  ? (jobWithSource?.original_source_code ?? '')
                  : (yamlVersion?.yaml_content ?? '')
              }
              language={activeTab === 'yaml' ? 'plaintext' : 'yaml'}
              onMetrics={() => undefined}
              pendingLineComments={[]}
              codeType={activeTab === 'yaml' ? 'yaml' : 'generated_code'}
              onAddLineComment={() => undefined}
            />
          </Box>

          {/* Draggable divider */}
          <ResizeHandle direction="horizontal" onResize={handleSplitResize} />

          {/* Right pane — output / active content */}
          <Box flex={1} overflow="hidden" minW={0} position="relative" display="flex" flexDirection="column">
            <Box
              position="absolute"
              top={0}
              left={0}
              right={0}
              h="20px"
              bg="rgba(0,0,0,0.35)"
              display="flex"
              alignItems="center"
              px={2}
              zIndex={5}
              pointerEvents="none"
            >
              <Text fontSize="10px" color={colors.fgMuted} fontFamily="mono" userSelect="none">
                {activeTab === 'yaml'
                  ? '📝 schema.yaml — generated YAML'
                  : `💻 ${codeFilename(job)} — generated code`}
              </Text>
            </Box>
            <MonacoView
              content={content}
              language={monacoLang}
              onMetrics={(lines, chars) => setMetrics({ lines, chars })}
              pendingLineComments={pendingLineComments.filter(
                c => c.codeType === (activeTab === 'yaml' ? 'yaml' : 'generated_code')
              )}
              codeType={activeTab === 'yaml' ? 'yaml' : 'generated_code'}
              onAddLineComment={onAddLineComment}
            />
          </Box>
        </Flex>
      )}

      {/* Single pane view */}
      {showContent === 'content' && !showDiff && !showSplit && !showVersionDiff && (
        <MonacoView
          content={content}
          language={monacoLang}
          onMetrics={(lines, chars) => setMetrics({ lines, chars })}
          pendingLineComments={pendingLineComments.filter(
            c => c.codeType === (activeTab === 'yaml' ? 'yaml' : 'generated_code')
          )}
          codeType={activeTab === 'yaml' ? 'yaml' : 'generated_code'}
          onAddLineComment={onAddLineComment}
          editMode={editMode}
          onContentChange={(val) => {
            setOverrideContent(val);
            setPendingEditLabel(prev => prev ?? 'Manual edit');
          }}
        />
      )}
      {showContent === 'content' && showDiff && (
        <Box flex={1} overflow="hidden" minH={0}>
          <DiffEditor
            height="100%"
            original={diffOriginal}
            modified={diffModified}
            originalLanguage={diffOriginalLang}
            modifiedLanguage={diffModifiedLang}
            theme="vs-dark"
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              fontSize: 12,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              scrollBeyondLastLine: false,
              padding: { top: 8 },
              scrollbar: { verticalScrollbarSize: 6 },
            }}
          />
        </Box>
      )}

      {/* ── Version diff panel — always mounted in content mode so hunk state survives panel close/reopen */}
      {showContent === 'content' && !showDiff && !showSplit && (
        <Box
          flex={1}
          overflow="hidden"
          minH={0}
          // Use CSS visibility instead of conditional rendering — preserves all useState inside VersionDiffPanel
          display={showVersionDiff ? 'flex' : 'none'}
          flexDirection="column"
        >
          <VersionDiffPanel
            jobId={isJob2 && activeTab === 'yaml' ? (parentJobId ?? jobId) : jobId}
            isYaml={activeTab === 'yaml' || !isJob2}
            currentVersionNum={activeTab === 'yaml' ? activeYAMLVersionNum : activeCodeVersionNum}
            draftContent={overrideContent}
            onApply={(merged, fromVer, toVer) => {
              const hadDraft = overrideContent != null;
              setOverrideContent(merged);
              const toLabel = hadDraft ? `v${toVer}+draft` : `v${toVer}`;
              setPendingEditLabel(prev =>
                prev
                  ? `${prev} + diff v${fromVer}→${toLabel}`
                  : `Applied diff v${fromVer}→${toLabel}`
              );
              setShowVersionDiff(false);
            }}
            onClose={() => setShowVersionDiff(false)}
          />
        </Box>
      )}

      {/* Info bar */}
      <EditorInfoBar
        job={job}
        lineCount={metrics?.lines}
        charCount={metrics?.chars}
        language={showDiff ? `Diff · ${languageName}` : languageName}
      />

      {/* ── Review comment modal ─────────────────────────────── */}
      <Modal
        isOpen={reviewModalDecision != null}
        onClose={() => setReviewModalDecision(null)}
        size="md"
        isCentered
      >
        <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(4px)" />
        <ModalContent bg={colors.panel} border={`1px solid ${colors.panelBorder}`} borderRadius="8px">
          <ModalHeader fontSize="14px" fontWeight="semibold" color={colors.fgActive} pb={2}>
            {reviewModalDecision === 'APPROVE_WITH_COMMENTS'
              ? 'Approve with Comments'
              : reviewModalDecision === 'CODE_REJECT_REGENERATE'
              ? 'Reject Code — Request Regeneration'
              : 'Reject YAML — Request Regeneration'}
          </ModalHeader>
          <ModalCloseButton color={colors.fgMuted} />
          <ModalBody pb={4}>
            {pendingLineComments.length > 0 && (
              <Text fontSize="11px" color={colors.fgMuted} mb={3}>
                {pendingLineComments.length} line comment{pendingLineComments.length !== 1 ? 's' : ''} will be included.
              </Text>
            )}
            <Textarea
              value={generalComment}
              onChange={e => setGeneralComment(e.target.value)}
              placeholder="General comment (optional)…"
              bg={colors.input}
              border={`1px solid ${colors.inputBorder}`}
              borderRadius="4px"
              color={colors.fg}
              fontSize="13px"
              _placeholder={{ color: colors.fgMuted, opacity: 0.5 }}
              _focus={{ borderColor: '#007acc', boxShadow: '0 0 0 1px #007acc' }}
              resize="vertical"
              minH="80px"
              rows={3}
            />
          </ModalBody>
          <ModalFooter gap={2} pt={0}>
            <Button
              size="sm"
              variant="ghost"
              color={colors.fgMuted}
              onClick={() => setReviewModalDecision(null)}
              fontSize="12px"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              colorScheme={
                reviewModalDecision === 'APPROVE_WITH_COMMENTS' ? 'orange' : 'red'
              }
              onClick={() => reviewModalDecision && handleReview(reviewModalDecision, generalComment)}
              isLoading={submitReview.isPending}
              fontSize="12px"
            >
              Submit
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Flex>
  );
}

// ─── EditorPanel (main export) ────────────────────────────────────────────────

export interface EditorPanelProps {
  jobId: number | null;
  pendingLineComments: PendingLineComment[];
  onAddLineComment: (c: PendingLineComment) => void;
  onClearLineComments: () => void;
}

/**
 * VS Code–style editor panel.
 * Renders a welcome screen when no job is selected.
 * When a job is selected:
 *  - Job 1 (YAML_CONVERSION): shows a YAML tab with Monaco editor
 *  - Job 2 (CODE_CONVERSION): shows both a YAML tab (parent) and a Code tab
 * Monaco is read-only; a Generate CTA is shown when content is missing.
 * Line comments: hovering the gutter shows a + button (GitHub-PR style);
 *   clicking opens an inline comment form via Monaco view zones.
 */
export default function EditorPanel({ jobId, pendingLineComments, onAddLineComment, onClearLineComments }: EditorPanelProps) {
  const colors = useVSColors();
  if (!jobId) return <WelcomeScreen />;
  return (
    <JobEditor
      jobId={jobId}
      pendingLineComments={pendingLineComments}
      onAddLineComment={onAddLineComment}
      onClearLineComments={onClearLineComments}
    />
  );
}
