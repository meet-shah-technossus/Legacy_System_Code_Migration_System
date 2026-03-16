/**
 * DirectEditorPanel.tsx
 *
 * VS Code-style editor panel for DIRECT_CONVERSION jobs.
 * Shows a split view of:
 *   Left  — Original Pick Basic source (read-only)
 *   Right — Generated target-language code (editable, full draft/version/diff features)
 *
 * All manual-edit features from EditorPanel are preserved:
 *   • Monaco code editor with glyph-margin inline line comments
 *   • Edit mode toggle (makes editor writable)
 *   • Unsaved-draft ribbon → Commit as new version
 *   • Version switcher dropdown (multi-version history)
 *   • Version-diff panel (GitHub-style interdiff with Apply)
 *   • Diff overlay (split Monaco DiffEditor)
 *   • Review actions bar: Accept / Reject & Regenerate
 *   • Process overlay during generation
 */

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
  FiX,
  FiDownload,
  FiExternalLink,
  FiPlay,
  FiAlertTriangle,
  FiChevronRight,
  FiCheckCircle,
  FiRotateCcw,
  FiGitMerge,
  FiColumns,
  FiGitCommit,
  FiEdit,
  FiGitBranch,
  FiZap,
  FiMessageCircle,
  FiXCircle,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { VS, useVSColors } from './vscodeTheme';
import ResizeHandle from './ResizeHandle';
import VersionDiffPanel from './VersionDiffPanel';
import { useJob, useJobWithSource, useAddLineComment, useUpdateJob, useTransitionJob } from '../../hooks/useJobs';
import { useQueryClient, useIsMutating } from '@tanstack/react-query';
import {
  useGeneratedCode,
  useCodeVersions,
  useCodeVersion,
  useCreateCodeVersion,
  useDirectGenerateCode,
  useDirectRegenerateCode,
  useDirectReviewCode,
} from '../../hooks/useCode';
import { CODE_KEYS } from '../../hooks/useCode';
import GenerationProcessingOverlay from './GenerationProcessingOverlay';
import { useAuthStore } from '../../store/authStore';
import { stateLabel, monacoLanguage, languageLabel } from '../../utils/format';
import type { MigrationJob, TargetLanguage, PendingLineComment, LineCommentCreate, LLMProvider } from '../../types';
import { codeApi } from '../../services/codeApi';

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingState() {
  const colors = useVSColors();
  return (
    <Flex flex={1} justify="center" align="center" h="100%">
      <Spinner size="md" color={colors.fgMuted} thickness="1.5px" />
    </Flex>
  );
}

function ErrorState({ message }: { message: string }) {
  const colors = useVSColors();
  return (
    <VStack flex={1} justify="center" align="center" spacing={3} h="100%">
      <Icon as={FiAlertTriangle as ComponentType} boxSize={8} color="#fc8181" opacity={0.5} />
      <Text fontSize="13px" color={colors.fgMuted} opacity={0.6}>{message}</Text>
    </VStack>
  );
}

interface BreadcrumbBarProps { segments: string[]; }
function BreadcrumbBar({ segments }: BreadcrumbBarProps) {
  const colors = useVSColors();
  return (
    <Flex h="24px" align="center" px={3} gap="4px" bg={colors.editor}
      borderBottom={`1px solid ${colors.sidebarBorder}`} flexShrink={0} overflow="hidden">
      {segments.map((seg, i) => (
        <Flex key={i} align="center" gap="4px">
          {i > 0 && <Icon as={FiChevronRight as ComponentType} boxSize="9px" color={colors.fgMuted} />}
          <Text fontSize="11px"
            color={i === segments.length - 1 ? colors.fg : colors.fgMuted}
            overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
            {seg}
          </Text>
        </Flex>
      ))}
    </Flex>
  );
}

interface TabProps {
  label: string;
  iconColor: string;
  isActive: boolean;
  isModified?: boolean;
  onClick: () => void;
}
function Tab({ label, iconColor, isActive, isModified, onClick }: TabProps) {
  const colors = useVSColors();
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
      onClick={onClick}
      flexShrink={0}
      userSelect="none"
    >
      <Box w="8px" h="8px" borderRadius="full" bg={iconColor} flexShrink={0} />
      <Text fontSize="13px" whiteSpace="nowrap">
        {label}
        {isModified && <Box as="span" color={colors.fgMuted}> ●</Box>}
      </Text>
    </Flex>
  );
}

interface EditorInfoBarProps {
  job: MigrationJob;
  lineCount?: number;
  charCount?: number;
  language: string;
}
function EditorInfoBar({ job, lineCount, charCount, language }: EditorInfoBarProps) {
  const colors = useVSColors();
  return (
    <Flex h="22px" align="center" justify="space-between" px={3}
      bg={colors.tabBar} borderTop={`1px solid ${colors.panelBorder}`}
      flexShrink={0} userSelect="none">
      <HStack spacing={4}>
        <HStack spacing={1}>
          <Box w="6px" h="6px" borderRadius="full" bg={colors.statusBar} />
          <Text fontSize="11px" color={colors.fgMuted}>{stateLabel(job.current_state)}</Text>
        </HStack>
        <Text fontSize="11px" color={colors.fgMuted}>
          Job #{job.id} · Direct Conversion
        </Text>
      </HStack>
      <HStack spacing={4}>
        {lineCount != null && <Text fontSize="11px" color={colors.fgMuted}>Ln {lineCount}</Text>}
        {charCount != null && <Text fontSize="11px" color={colors.fgMuted}>{charCount} chars</Text>}
        <Text fontSize="11px" color={colors.fgMuted}>{language}</Text>
        <Text fontSize="11px" color={colors.fgMuted}>UTF-8</Text>
      </HStack>
    </Flex>
  );
}

// ─── MonacoView (identical to EditorPanel's to preserve all features) ─────────

const GLYPH_CSS = `
  .lms-comment-dot-direct {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .lms-comment-dot-direct::before {
    content: '●';
    color: #f59e0b;
    font-size: 9px;
    line-height: 1;
  }
`;

interface MonacoViewProps {
  content: string;
  language: string;
  readOnly?: boolean;
  onMetrics?: (lines: number, chars: number) => void;
  pendingLineComments: PendingLineComment[];
  codeType: 'yaml' | 'generated_code';
  onAddLineComment: (c: PendingLineComment) => void;
  editMode?: boolean;
  onContentChange?: (newContent: string) => void;
}

function MonacoView({
  content, language, readOnly = false, onMetrics,
  pendingLineComments, codeType, onAddLineComment,
  editMode = false, onContentChange,
}: MonacoViewProps) {
  const colors = useVSColors();
  const editorRef           = useRef<Parameters<OnMount>[0] | null>(null);
  const decorationsRef      = useRef<ReturnType<Parameters<OnMount>[0]['createDecorationsCollection']> | null>(null);
  const containerRef        = useRef<HTMLDivElement>(null);
  const isHoveringButton    = useRef(false);
  // Suppresses gutter hover for ~350ms after the form closes so the + button
  // doesn't immediately reappear while the cursor is still over the gutter.
  const suppressHoverRef    = useRef(false);

  const [hoverLine,       setHoverLine]       = useState<number | null>(null);
  const [hoverY,          setHoverY]          = useState<number>(0);
  const [commentFormLine, setCommentFormLine] = useState<number | null>(null);
  const [commentFormY,    setCommentFormY]    = useState<number>(0);
  const [commentText,     setCommentText]     = useState('');

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
          glyphMarginClassName: 'lms-comment-dot-direct',
          glyphMarginHoverMessage: { value: `📌 *Line ${c.lineNumber}:* ${c.text}` },
        },
      }))
    );
  }, [pendingLineComments]);

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

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    const lineCount = editor.getModel()?.getLineCount() ?? 0;
    onMetrics?.(lineCount, content.length);
    decorationsRef.current = editor.createDecorationsCollection([]);
    editor.onMouseMove((e: Parameters<Parameters<typeof editor.onMouseMove>[0]>[0]) => {
      const { type, position } = e.target as { type: number; position?: { lineNumber: number } };
      if ((type === 3 || type === 2) && position) {
        if (suppressHoverRef.current) return;
        const rect = containerRef.current?.getBoundingClientRect();
        const relY = rect ? e.event.posy - rect.top : e.event.posy;
        setHoverLine(position.lineNumber);
        setHoverY(relY);
      } else if (!isHoveringButton.current) {
        setHoverLine(null);
      }
    });
    editor.onMouseLeave(() => { if (!isHoveringButton.current) setHoverLine(null); });
  };

  const isEditable = !readOnly && editMode;

  return (
    <>
      <Global styles={GLYPH_CSS} />
      <Box ref={containerRef} flex={1} overflow="hidden" minH={0} position="relative">
        <Editor
          height="100%"
          language={language}
          value={content}
          theme="vs-dark"
          options={{
            readOnly: !isEditable,
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
            glyphMargin: !readOnly,
            contextmenu: isEditable,
            scrollbar: { vertical: 'auto', horizontal: 'auto', verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            padding: { top: 8 },
            domReadOnly: !isEditable,
          }}
          onChange={isEditable ? (val) => { if (onContentChange) onContentChange(val ?? ''); } : undefined}
          onMount={handleMount}
        />

        {/* + button on gutter hover (only for editable/annotatable panes) */}
        {!readOnly && hoverLine != null && commentFormLine == null && (
          <Box
            position="absolute" left="2px" top={`${hoverY - 10}px`} zIndex={10}
            w="20px" h="20px" borderRadius="3px" bg={colors.statusBar}
            display="flex" alignItems="center" justifyContent="center"
            cursor="pointer"
            onClick={() => openForm(hoverLine, hoverY)}
            onMouseEnter={() => { isHoveringButton.current = true; }}
            onMouseLeave={() => { isHoveringButton.current = false; setHoverLine(null); }}
            _hover={{ bg: '#005fa3' }}
            userSelect="none" fontSize="16px" fontWeight="300" color="white" lineHeight="1"
            title={`Add comment on line ${hoverLine}`}
          >+</Box>
        )}

        {/* Inline comment form */}
        {!readOnly && commentFormLine != null && (
          <Box
            position="absolute" left="50px" right="10px" top={`${commentFormY + 4}px`} zIndex={20}
            bg={colors.panel} border={`1px solid ${colors.statusBar}`} borderRadius="6px"
            p="8px" display="flex" flexDirection="column" gap="6px"
            boxShadow="0 4px 16px rgba(0,0,0,0.55)"
            onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
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
                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '4px', color: '#cccccc', fontSize: '12px',
                fontFamily: 'inherit', padding: '5px 7px', resize: 'none',
                height: '36px', outline: 'none', width: '100%', boxSizing: 'border-box',
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); }
                if (e.key === 'Escape') cancelForm();
              }}
            />
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button onClick={cancelForm} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#888', borderRadius: '3px', padding: '2px 10px', fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submitComment} style={{ background: commentText.trim() ? '#007acc' : '#444', border: 'none', color: commentText.trim() ? 'white' : '#888', borderRadius: '3px', padding: '2px 10px', fontSize: '11px', cursor: commentText.trim() ? 'pointer' : 'default' }}>Add</button>
            </div>
          </Box>
        )}
      </Box>
    </>
  );
}

// ─── DirectReviewActionsBar ────────────────────────────────────────────────────

interface DirectReviewActionsBarProps {
  isPending: boolean;
  versionNum?: number;
  onAccept: () => void;
  onOpenRejectModal: () => void;
}

function DirectReviewActionsBar({ isPending, versionNum, onAccept, onOpenRejectModal }: DirectReviewActionsBarProps) {
  const colors = useVSColors();
  return (
    <Flex
      h="32px" align="center" px={3} gap={2}
      bg="rgba(0,0,0,0.15)" borderBottom={`1px solid ${colors.panelBorder}`} flexShrink={0}
    >
      <Text fontSize="10px" color={colors.fgMuted} opacity={0.5} mr={1} userSelect="none">
        Code review:
      </Text>
      <Button
        size="xs" h="22px" px="10px" fontSize="11px"
        leftIcon={<Icon as={FiCheckCircle as ComponentType} boxSize="11px" />}
        colorScheme="teal" variant="solid"
        isLoading={isPending} onClick={onAccept}
      >
        Accept{versionNum ? ` v${versionNum}` : ''}
      </Button>
      <Button
        size="xs" h="22px" px="10px" fontSize="11px"
        leftIcon={<Icon as={FiRotateCcw as ComponentType} boxSize="11px" />}
        colorScheme="red" variant="outline"
        isLoading={isPending} onClick={onOpenRejectModal}
        color="#fc8181" borderColor="rgba(252,129,129,0.4)"
        _hover={{ bg: 'rgba(252,129,129,0.1)' }}
      >
        Reject &amp; Regenerate
      </Button>
    </Flex>
  );
}

// ─── GenerateCTA ──────────────────────────────────────────────────────────────

interface DirectGenerateCTAProps { job: MigrationJob; }

function DirectGenerateCTA({ job }: DirectGenerateCTAProps) {
  const colors = useVSColors();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const performer = user?.username ?? 'system';
  const directGenerate = useDirectGenerateCode(job.id);
  const isRegenerateState = job.current_state === 'DIRECT_CODE_REGENERATE_REQUESTED';

  const handleGenerate = () => {
    if (!job.target_language) return;
    directGenerate.mutate({
      target_language: job.target_language,
      performed_by: performer,
      llm_provider: (job.code_llm_provider ?? 'OPENAI') as LLMProvider,
    });
  };

  return (
    <VStack flex={1} justify="center" align="center" spacing={5} h="100%" userSelect="none">
      <Icon as={FiZap as ComponentType} boxSize={14} color={colors.fgMuted} opacity={0.15} />
      <VStack spacing={1}>
        <Text fontSize="16px" color={colors.fg} opacity={0.5} fontWeight="300">
          {isRegenerateState ? 'Ready to Regenerate' : 'No code generated yet'}
        </Text>
        <Text fontSize="12px" color={colors.fgMuted} opacity={0.45}>
          {isRegenerateState
            ? 'Reviewer requested regeneration — run the LLM again'
            : 'Run the LLM to generate code directly from Pick Basic source'}
        </Text>
      </VStack>
      <Flex gap={3} mt={2}>
        <Button
          size="sm"
          leftIcon={<Icon as={isRegenerateState ? FiRotateCcw : FiPlay as ComponentType} />}
          colorScheme="purple"
          variant="solid"
          isLoading={directGenerate.isPending}
          onClick={handleGenerate}
          fontSize="12px"
          h="28px"
        >
          {isRegenerateState ? 'Regenerate Code' : 'Generate Code'}
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
    </VStack>
  );
}

// ─── DirectJobEditor (the main inner component) ───────────────────────────────

interface DirectJobEditorProps {
  jobId: number;
  pendingLineComments: PendingLineComment[];
  onAddLineComment: (c: PendingLineComment) => void;
  onClearLineComments: () => void;
}

function DirectJobEditor({
  jobId, pendingLineComments, onAddLineComment, onClearLineComments,
}: DirectJobEditorProps) {
  const colors    = useVSColors();
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const { user }  = useAuthStore();
  const performer = user?.username ?? 'system';

  // ── State ─────────────────────────────────────────────────────────────
  const [metrics,          setMetrics]          = useState<{ lines: number; chars: number } | null>(null);
  const [showDiff,         setShowDiff]         = useState(false);
  const [showSplit,        setShowSplit]        = useState(false);
  const [splitLeftPx,      setSplitLeftPx]      = useState(480);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [showVersionDiff,  setShowVersionDiff]  = useState(false);
  const [overrideContent,  setOverrideContent]  = useState<string | null>(null);
  const [editMode,         setEditMode]         = useState(false);
  const [selectedVersionNum, setSelectedVersionNum] = useState<number | null>(null);
  const [pendingEditLabel, setPendingEditLabel] = useState<string | null>(null);

  // Reject modal
  const [showRejectModal,  setShowRejectModal]  = useState(false);
  const [rejectFeedback,   setRejectFeedback]   = useState('');
  const [regenProvider,    setRegenProvider]    = useState<LLMProvider>('OPENAI');
  // Syntax error panel dismissal — keyed by generatedCode.id so it reappears after new generation
  const [syntaxErrorsDismissedForId, setSyntaxErrorsDismissedForId] = useState<number | null>(null);

  const handleSplitResize = useCallback((delta: number) => {
    setSplitLeftPx(prev => {
      const containerWidth = splitContainerRef.current?.clientWidth ?? 960;
      return Math.max(200, Math.min(containerWidth - 200, prev + delta));
    });
  }, []);

  // ── Data ──────────────────────────────────────────────────────────────
  const { data: job, isLoading: jobLoading, isError: jobError } = useJob(jobId);
  const { data: generatedCode, isLoading: codeLoading, isError: codeError } = useGeneratedCode(jobId);
  const { data: jobWithSource } = useJobWithSource(jobId);
  const { data: codeVersionsList } = useCodeVersions(jobId);
  const { data: specificCodeVersion, isLoading: specificCodeLoading } = useCodeVersion(jobId, selectedVersionNum);

  // ── Mutations ─────────────────────────────────────────────────────────
  const addLineComment     = useAddLineComment(jobId);
  const createCodeVersion  = useCreateCodeVersion(jobId);
  const directGenerate     = useDirectGenerateCode(jobId);
  const directRegenerate   = useDirectRegenerateCode(jobId);
  const directReview       = useDirectReviewCode(jobId);
  const updateJobProvider  = useUpdateJob(jobId);
  // Cancel regeneration request — transitions DIRECT_CODE_REGENERATE_REQUESTED → DIRECT_CODE_UNDER_REVIEW
  const cancelRegen        = useTransitionJob(jobId);

  // Sync regenProvider with the job's stored preference when the job record updates
  useEffect(() => {
    const stored = job?.code_llm_provider as LLMProvider | undefined;
    if (stored) setRegenProvider(stored);
  }, [job?.code_llm_provider]);

  // ── Generation overlay ────────────────────────────────────────────────
  // NOTE: Both hooks must be called unconditionally (no short-circuit in the call site)
  const isDirectGenerating   = useIsMutating({ mutationKey: ['direct-generate-code',   jobId] });
  const isDirectRegenerating = useIsMutating({ mutationKey: ['direct-regenerate-code', jobId] });
  const isGenerating = isDirectGenerating > 0 || isDirectRegenerating > 0;

  // ── Guards ────────────────────────────────────────────────────────────
  if (jobLoading) return <LoadingState />;
  if (jobError || !job) return <ErrorState message={`Could not load job #${jobId}`} />;

  // ── Content resolution ────────────────────────────────────────────────
  const showContent = (() => {
    if (codeLoading) return 'loading';
    if (codeError || !generatedCode) return 'generate';
    if (selectedVersionNum && specificCodeLoading) return 'loading';
    if (selectedVersionNum && !specificCodeVersion) return 'loading';
    // Also show generate CTA in regenerate-requested state when no override
    if (job.current_state === 'DIRECT_CODE_REGENERATE_REQUESTED' && !generatedCode) return 'generate';
    return 'content';
  })();

  const content     = overrideContent ?? (selectedVersionNum ? (specificCodeVersion?.code_content ?? '') : (generatedCode?.code_content ?? ''));
  const monacoLang  = monacoLanguage(job.target_language ?? 'PYTHON');
  const langLabel   = languageLabel(job.target_language ?? null);
  const fileLabel   = codeFilename(job);
  const langColor   = job.target_language ? LANG_COLOR[job.target_language] : '#cccccc';
  const sourceCode  = jobWithSource?.original_source_code ?? '';

  const activeVersionNum = selectedVersionNum ?? (generatedCode?.version_number ?? 0);
  const nextVersionNum   = codeVersionsList && codeVersionsList.length > 0
    ? Math.max(...codeVersionsList.map(v => v.version_number ?? 0)) + 1
    : ((generatedCode as { version_number?: number })?.version_number ?? 0) + 1;

  // ── Review state ──────────────────────────────────────────────────────
  const reviewable = job.current_state === 'DIRECT_CODE_UNDER_REVIEW';

  // ── Breadcrumb ────────────────────────────────────────────────────────
  const breadcrumbs = ['DIRECT MIGRATION', job.source_filename ?? `Job #${jobId}`, fileLabel].filter(Boolean);

  // ── Commit draft ──────────────────────────────────────────────────────
  const handleCommitDraft = async () => {
    if (!overrideContent) return;
    await createCodeVersion.mutateAsync({
      code_content: overrideContent,
      edited_by: performer,
      edit_reason: pendingEditLabel ?? 'Manual edit',
    });
    setOverrideContent(null);
    setEditMode(false);
    setPendingEditLabel(null);
    setSelectedVersionNum(null);
  };

  // ── Accept ────────────────────────────────────────────────────────────
  const handleAccept = async () => {
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
    directReview.mutate(
      {
        decision: 'DIRECT_APPROVE',
        reviewed_by: performer,
        // Pin the exact version the reviewer was looking at so the backend
        // marks that specific version as accepted, not just whatever is_current.
        version_number: activeVersionNum || undefined,
      },
      { onSuccess: () => { onClearLineComments(); } }
    );
  };

  // ── Reject & Regenerate ────────────────────────────────────────────────
  const handleReject = async () => {
    // Save pending line comments first
    const lineCommentContext = pendingLineComments.map(lc => `L${lc.lineNumber}: ${lc.text}`).join('\n');
    for (const lc of pendingLineComments) {
      await addLineComment.mutateAsync({
        line_number: lc.lineNumber,
        code_type: lc.codeType,
        comment: lc.text,
        reviewer: performer,
      });
    }
    directReview.mutate(
      {
        decision: 'DIRECT_REJECT_REGENERATE',
        general_feedback: rejectFeedback || undefined,
        reviewed_by: performer,
      },
      {
        onSuccess: () => {
          onClearLineComments();
          setRejectFeedback('');
          setShowRejectModal(false);
        },
      }
    );
  };

  const stateColor =
    job.current_state.includes('COMPLETED')     ? 'green.700' :
    job.current_state.includes('ACCEPTED')       ? 'teal.700'  :
    job.current_state.includes('REGENERATE')     ? '#c05621'   :
    job.current_state.includes('UNDER_REVIEW')   ? '#4a1d96'   :
    job.current_state === 'DIRECT_CODE_GENERATED' ? '#2d3748'  :
    'gray.600';

  return (
    <Flex direction="column" h="100%" overflow="hidden" position="relative">
      {/* Generation overlay */}
      {isGenerating && (
        <GenerationProcessingOverlay type="code" language={job.target_language} />
      )}

      {/* Tab bar */}
      <Flex
        bg={colors.tabBar}
        borderBottom={`1px solid ${colors.panelBorder}`}
        align="flex-end"
        flexShrink={0}
        overflow="hidden"
      >
        <Tab
          label={fileLabel}
          iconColor={langColor}
          isActive={true}
          isModified={overrideContent !== null}
          onClick={() => {}}
        />

        {/* Spacer + action buttons */}
        <Flex flex={1} justify="flex-end" align="center" pr={2} pb="1px" gap="2px">
          {/* Version switcher */}
          {showContent === 'content' && (() => {
            const vList = (codeVersionsList ?? []).map(v => ({
              num: v.version_number ?? 0,
              label: `v${v.version_number}${v.is_accepted ? ' ✓' : (v.is_current ? ' ●' : '')}`,
            }));
            const latestNum  = vList[0]?.num ?? null;
            const displayVal = selectedVersionNum ?? latestNum ?? '';
            if (vList.length < 2) return null;
            return (
              <Tooltip label={`Switch version (viewing ${selectedVersionNum ? `v${selectedVersionNum}` : 'latest'})`} hasArrow placement="bottom" openDelay={500}>
                <Select
                  size="xs"
                  value={displayVal}
                  onChange={e => {
                    const vn = Number(e.target.value);
                    const goLatest = vn === latestNum;
                    setSelectedVersionNum(goLatest ? null : vn);
                    setOverrideContent(null);
                    setEditMode(false);
                    setPendingEditLabel(null);
                  }}
                  w="68px"
                  bg={colors.input}
                  borderColor={selectedVersionNum ? '#7c3aed' : colors.inputBorder}
                  color={selectedVersionNum ? '#c4b5fd' : colors.fg}
                  fontSize="10px" h="22px" flexShrink={0}
                  _hover={{ borderColor: '#7c3aed' }}
                >
                  {vList.map(v => <option key={v.num} value={v.num}>{v.label}</option>)}
                </Select>
              </Tooltip>
            );
          })()}

          {/* Diff toggle */}
          {showContent === 'content' && (
            <Tooltip label={showDiff ? 'Hide diff' : 'Show diff (source → code)'} hasArrow placement="bottom" openDelay={500}>
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

          {/* Split view toggle */}
          {showContent === 'content' && !showDiff && (
            <Tooltip label={showSplit ? 'Close split view' : 'Split: Source ↔ Code'} hasArrow placement="bottom" openDelay={500}>
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

          {/* Edit mode toggle */}
          {showContent === 'content' && !showDiff && !showSplit && (
            <Tooltip label={editMode ? 'Exit edit mode (changes stay in draft)' : 'Edit content manually'} hasArrow placement="bottom" openDelay={500}>
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

          {/* Version diff panel toggle */}
          {showContent === 'content' && !showDiff && !showSplit && (
            <Tooltip label={showVersionDiff ? 'Close version diff' : 'Compare versions (GitHub-style diff)'} hasArrow placement="bottom" openDelay={500}>
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

          {/* Open job detail */}
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

          {/* Download */}
          {generatedCode && (
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
        h="26px" align="center" px={3} gap={2}
        bg={colors.editor} borderBottom={`1px solid ${colors.sidebarBorder}`} flexShrink={0}
      >
        <Badge
          fontSize="10px" px="6px" py="1px" borderRadius="3px"
          bg={stateColor} color="white" textTransform="none" fontWeight="medium"
        >
          {stateLabel(job.current_state)}
        </Badge>
        {job.target_language && (
          <Badge fontSize="10px" px="6px" py="1px" borderRadius="3px" bg="gray.700"
            color={langColor} textTransform="none">
            {langLabel}
          </Badge>
        )}
        <Badge fontSize="10px" px="6px" py="1px" borderRadius="3px" bg="purple.900"
          color="purple.300" textTransform="none">
          Direct Conversion
        </Badge>
        {/* Before first generation: interactive selector so user can pick or switch provider.
            After first generation (code_llm_model is set): read-only badge showing what was used. */}
        {!job.code_llm_model ? (
          <Select
            size="xs" h="18px" fontSize="10px" w="96px"
            value={job.code_llm_provider ?? 'OPENAI'}
            onChange={(e) => {
              const v = e.target.value as LLMProvider;
              setRegenProvider(v);
              updateJobProvider.mutate({ code_llm_provider: v });
            }}
            isDisabled={updateJobProvider.isPending}
            sx={{
              bg: 'transparent',
              borderColor: 'rgba(255,255,255,0.12)',
              color: (job.code_llm_provider ?? 'OPENAI') === 'ANTHROPIC' ? '#d97706' : '#3b82f6',
              fontFamily: 'mono',
              borderRadius: '3px',
              cursor: 'pointer',
            }}
          >
            <option value="OPENAI">OpenAI</option>
            <option value="ANTHROPIC">Anthropic</option>
          </Select>
        ) : (
          <Badge
            fontSize="10px" px="6px" py="1px" borderRadius="3px"
            bg="transparent"
            borderWidth="1px"
            borderColor="rgba(255,255,255,0.12)"
            color={(job.code_llm_provider ?? 'OPENAI') === 'ANTHROPIC' ? '#d97706' : '#3b82f6'}
            textTransform="none"
            fontFamily="mono"
          >
            {(job.code_llm_provider ?? 'OPENAI') === 'ANTHROPIC' ? 'Claude' : 'OpenAI'}
          </Badge>
        )}
      </Flex>

      {/* Review actions bar */}
      {reviewable && showContent === 'content' && (
        <DirectReviewActionsBar
          isPending={directReview.isPending || addLineComment.isPending}
          versionNum={activeVersionNum}
          onAccept={handleAccept}
          onOpenRejectModal={() => setShowRejectModal(true)}
        />
      )}

      {/* Completed download CTA */}
      {(job.current_state === 'DIRECT_CODE_ACCEPTED' || job.current_state === 'DIRECT_COMPLETED') && (
        <Flex
          align="center" justify="space-between" px={4} py="6px"
          bg="rgba(34,197,94,0.10)" borderBottom="1px solid rgba(34,197,94,0.28)"
          flexShrink={0} gap={3}
        >
          <Flex align="center" gap={2}>
            <Icon as={FiCheckCircle as ComponentType} color="green.300" boxSize="14px" />
            <Text fontSize="12px" color="green.200" fontWeight="medium">
              Code is accepted — direct conversion complete
            </Text>
          </Flex>
          <Button
            size="xs" colorScheme="green" bg="green.700" _hover={{ bg: 'green.600' }}
            leftIcon={<Icon as={FiDownload as ComponentType} boxSize="10px" />}
            as="a" href={codeApi.downloadUrl(jobId)} download
          >
            Download {job.target_language ?? 'Code'}
          </Button>
        </Flex>
      )}

      {/* Rejected — regeneration queued banner with actionable button */}
      {job.current_state === 'DIRECT_CODE_REGENERATE_REQUESTED' && showContent === 'content' && (
        <Flex
          align="center" justify="space-between" px={4} py="6px"
          bg="rgba(234,179,8,0.10)" borderBottom="1px solid rgba(234,179,8,0.28)"
          flexShrink={0} gap={3}
        >
          <Flex align="center" gap={2}>
            <Icon as={FiRotateCcw as ComponentType} color="yellow.300" boxSize="13px" />
            <Text fontSize="12px" color="yellow.200" fontWeight="medium">Regeneration Requested</Text>
            <Text fontSize="11px" color={colors.fgMuted}>
              — reviewer rejected. Run the LLM to produce a new version.
            </Text>
          </Flex>
          <HStack spacing={2}>
            <Select
              size="xs" h="22px" fontSize="11px" w="120px"
              value={regenProvider}
              onChange={(e) => setRegenProvider(e.target.value as LLMProvider)}
              sx={{ bg: 'rgba(0,0,0,0.35)', borderColor: 'rgba(234,179,8,0.35)', color: 'yellow.100', fontFamily: 'mono' }}
            >
              <option value="OPENAI">OpenAI</option>
              <option value="ANTHROPIC">Anthropic</option>
            </Select>
            <Button
              size="xs" h="22px" px="10px" fontSize="11px"
              leftIcon={<Icon as={FiRotateCcw as ComponentType} boxSize="11px" />}
              colorScheme="yellow" variant="solid"
              isLoading={directRegenerate.isPending}
              onClick={() => {
                if (!job.target_language) return;
                directRegenerate.mutate({ target_language: job.target_language, performed_by: performer, llm_provider: regenProvider });
              }}
            >
              Regenerate Code
            </Button>
            <Button
              size="xs" h="22px" px="10px" fontSize="11px"
              leftIcon={<Icon as={FiXCircle as ComponentType} boxSize="11px" />}
              colorScheme="gray" variant="outline"
              color={colors.fgMuted}
              borderColor="rgba(156,163,175,0.4)"
              _hover={{ bg: 'rgba(156,163,175,0.1)', color: colors.fg }}
              isLoading={cancelRegen.isPending}
              onClick={() => cancelRegen.mutate({ new_state: 'DIRECT_CODE_UNDER_REVIEW', reason: 'Regeneration request cancelled by user' })}
            >
              Cancel
            </Button>
          </HStack>
        </Flex>
      )}

      {/* Syntax Error Warning — shown when auto-fix retry still left errors */}
      {(() => {
        const errors = generatedCode?.validation_errors;
        if (!errors || errors.length === 0) return null;
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

      {/* Draft ribbon */}
      {overrideContent !== null && showContent === 'content' && !showDiff && !showSplit && (
        <Flex
          align="center" justify="space-between" px={4} py="6px"
          bg="rgba(234,179,8,0.10)" borderBottom="1px solid rgba(234,179,8,0.28)"
          flexShrink={0} gap={3}
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
            <Tooltip label={`Write draft changes to database as version ${nextVersionNum}`} hasArrow placement="top">
              <Button
                size="xs" colorScheme="yellow"
                leftIcon={<Icon as={FiGitBranch as ComponentType} boxSize="10px" />}
                isLoading={createCodeVersion.isPending}
                onClick={handleCommitDraft}
              >
                Commit as v{nextVersionNum}
              </Button>
            </Tooltip>
            <IconButton
              aria-label="Discard draft"
              icon={<Icon as={FiX as ComponentType} boxSize="11px" />}
              size="xs" variant="ghost" color="#fc8181"
              _hover={{ bg: 'rgba(252,129,129,0.12)' }}
              minW="22px" h="22px"
              onClick={() => { setOverrideContent(null); setEditMode(false); setPendingEditLabel(null); }}
            />
          </HStack>
        </Flex>
      )}

      {/* Main content */}
      {showContent === 'loading' && <LoadingState />}
      {showContent === 'generate' && <DirectGenerateCTA job={job} />}

      {/* ── Split view: source ↔ code ── */}
      {showContent === 'content' && !showDiff && showSplit && (
        <Flex ref={splitContainerRef} flex={1} overflow="hidden" minH={0}>
          <Box
            style={{ width: `${splitLeftPx}px`, minWidth: '200px' }}
            overflow="hidden" flexShrink={0}
            borderRight={`1px solid ${colors.panelBorder}`}
            position="relative" display="flex" flexDirection="column"
          >
            <Box
              position="absolute" top={0} left={0} right={0} h="20px"
              bg="rgba(0,0,0,0.35)" display="flex" alignItems="center"
              px={2} zIndex={5} pointerEvents="none"
            >
              <Text fontSize="10px" color={colors.fgMuted} fontFamily="mono" userSelect="none">
                📄 {job.source_filename ?? 'source.pick'} — original source
              </Text>
            </Box>
            <MonacoView
              content={sourceCode}
              language="plaintext"
              readOnly={true}
              onMetrics={() => undefined}
              pendingLineComments={[]}
              codeType="generated_code"
              onAddLineComment={() => undefined}
            />
          </Box>
          <ResizeHandle direction="horizontal" onResize={handleSplitResize} />
          <Box flex={1} overflow="hidden" minW={0} position="relative" display="flex" flexDirection="column">
            <Box
              position="absolute" top={0} left={0} right={0} h="20px"
              bg="rgba(0,0,0,0.35)" display="flex" alignItems="center"
              px={2} zIndex={5} pointerEvents="none"
            >
              <Text fontSize="10px" color={colors.fgMuted} fontFamily="mono" userSelect="none">
                💻 {fileLabel} — generated code
              </Text>
            </Box>
            <MonacoView
              content={content}
              language={monacoLang}
              onMetrics={(lines, chars) => setMetrics({ lines, chars })}
              pendingLineComments={pendingLineComments.filter(c => c.codeType === 'generated_code')}
              codeType="generated_code"
              onAddLineComment={onAddLineComment}
            />
          </Box>
        </Flex>
      )}

      {/* ── Single pane ── */}
      {showContent === 'content' && !showDiff && !showSplit && !showVersionDiff && (
        <MonacoView
          content={content}
          language={monacoLang}
          onMetrics={(lines, chars) => setMetrics({ lines, chars })}
          pendingLineComments={pendingLineComments.filter(c => c.codeType === 'generated_code')}
          codeType="generated_code"
          onAddLineComment={onAddLineComment}
          editMode={editMode}
          onContentChange={(val) => {
            setOverrideContent(val);
            setPendingEditLabel(prev => prev ?? 'Manual edit');
          }}
        />
      )}

      {/* ── Diff overlay (source vs generated code) ── */}
      {showContent === 'content' && showDiff && (
        <Box flex={1} overflow="hidden" minH={0}>
          <DiffEditor
            height="100%"
            original={sourceCode}
            modified={content}
            originalLanguage="plaintext"
            modifiedLanguage={monacoLang}
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

      {/* ── Version diff panel — always mounted so hunk state survives toggle ── */}
      {showContent === 'content' && !showDiff && !showSplit && (
        <Box
          flex={1} overflow="hidden" minH={0}
          display={showVersionDiff ? 'flex' : 'none'}
          flexDirection="column"
        >
          <VersionDiffPanel
            jobId={jobId}
            isYaml={false}
            currentVersionNum={activeVersionNum}
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
        language={showDiff ? `Diff · ${langLabel}` : langLabel}
      />

      {/* ── Reject & Regenerate modal ── */}
      <Modal isOpen={showRejectModal} onClose={() => setShowRejectModal(false)} size="md" isCentered>
        <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(4px)" />
        <ModalContent bg={colors.panel} border={`1px solid ${colors.panelBorder}`} borderRadius="8px">
          <ModalHeader fontSize="14px" fontWeight="semibold" color={colors.fgActive} pb={2}>
            Reject Code — Request Regeneration
          </ModalHeader>
          <ModalCloseButton color={colors.fgMuted} />
          <ModalBody pb={4}>
            {pendingLineComments.length > 0 && (
              <Text fontSize="11px" color={colors.fgMuted} mb={3}>
                {pendingLineComments.length} line comment{pendingLineComments.length !== 1 ? 's' : ''} will be included.
              </Text>
            )}
            <Textarea
              value={rejectFeedback}
              onChange={e => setRejectFeedback(e.target.value)}
              placeholder="General feedback for the AI (optional)…"
              bg={colors.input} border={`1px solid ${colors.inputBorder}`}
              borderRadius="4px" color={colors.fg} fontSize="13px"
              _placeholder={{ color: colors.fgMuted, opacity: 0.5 }}
              _focus={{ borderColor: '#007acc', boxShadow: '0 0 0 1px #007acc' }}
              resize="vertical" minH="80px" rows={3}
            />
          </ModalBody>
          <ModalFooter gap={2} pt={0}>
            <Button size="sm" variant="ghost" color={colors.fgMuted}
              onClick={() => setShowRejectModal(false)} fontSize="12px">Cancel</Button>
            <Button size="sm" colorScheme="red"
              onClick={handleReject}
              isLoading={directReview.isPending}
              fontSize="12px">
              <Icon as={FiMessageCircle as ComponentType} mr={1} boxSize="12px" />
              Reject &amp; Regenerate
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Flex>
  );
}

// ─── DirectEditorPanel (main export) ─────────────────────────────────────────

export interface DirectEditorPanelProps {
  jobId: number | null;
  pendingLineComments: PendingLineComment[];
  onAddLineComment: (c: PendingLineComment) => void;
  onClearLineComments: () => void;
}

/**
 * VS Code–style editor panel for Direct Conversion jobs.
 * Renders a welcome screen when no job is selected.
 * When a job is selected shows the generated code editor with all
 * manual-edit, draft, version-history, version-diff and review features.
 */
export default function DirectEditorPanel({
  jobId, pendingLineComments, onAddLineComment, onClearLineComments,
}: DirectEditorPanelProps) {
  const colors   = useVSColors();
  const navigate = useNavigate();

  if (!jobId) {
    return (
      <VStack flex={1} justify="center" align="center" spacing={6} h="100%" userSelect="none">
        <Icon as={FiCode as ComponentType} boxSize={20} color={colors.fgMuted} opacity={0.1} />
        <VStack spacing={2}>
          <Text fontSize="22px" fontWeight="300" color={colors.fg} opacity={0.35} letterSpacing="-0.02em">
            Direct Migration Studio
          </Text>
          <Text fontSize="13px" color={colors.fgMuted} opacity={0.4}>
            No job loaded
          </Text>
        </VStack>
        <Button
          size="sm" colorScheme="purple" variant="outline" fontSize="12px"
          leftIcon={<Icon as={FiZap as ComponentType} />}
          onClick={() => navigate('/jobs/new')}
        >
          Create Direct Conversion Job
        </Button>
      </VStack>
    );
  }

  return (
    <DirectJobEditor
      jobId={jobId}
      pendingLineComments={pendingLineComments}
      onAddLineComment={onAddLineComment}
      onClearLineComments={onClearLineComments}
    />
  );
}
