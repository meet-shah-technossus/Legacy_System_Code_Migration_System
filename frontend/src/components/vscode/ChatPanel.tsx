import {
  Box,
  Flex,
  Icon,
  IconButton,
  Text,
  Textarea,
  Tooltip,
  VStack,
  HStack,
  Badge,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';
import type { ComponentType, ReactNode } from 'react';
import {
  FiSend,
  FiTrash2,
  FiCpu,
  FiUser,
  FiZap,
  FiX,
  FiMessageSquare,
  FiCode,
  FiBook,
  FiAlertCircle,
} from 'react-icons/fi';
import { VS, useVSColors } from './vscodeTheme';
import { useAuthStore } from '../../store/authStore';
import { useJob } from '../../hooks/useJobs';
import { chatApi } from '../../services/chatApi';
import type { ChatMessage, ChatLineComment } from '../../services/chatApi';
import type { PendingLineComment } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocalMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isLoading?: boolean;
}

export interface ChatPanelProps {
  jobId: number | null;
  /** Pending line comments created in the editor — shown as chips above the input */
  lineComments?: PendingLineComment[];
  /** Called when the user removes a chip */
  onRemoveLineComment?: (id: string) => void;
}

// ─── Animations ───────────────────────────────────────────────────────────────

const dotBounce = keyframes`
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40%           { transform: translateY(-5px); opacity: 1; }
`;

// ─── Lightweight Markdown renderer ────────────────────────────────────────────
// Handles: fenced code blocks, inline code, **bold**, and plain text.

function renderMarkdown(text: string, colors: ReturnType<typeof useVSColors>): ReactNode[] {
  const segments: ReactNode[] = [];
  const codeBlockRe = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = codeBlockRe.exec(text)) !== null) {
    // Text before the code block
    if (match.index > lastIndex) {
      segments.push(
        <InlineMarkdown key={key++} text={text.slice(lastIndex, match.index)} />
      );
    }
    // Code block
    const lang = match[1] || 'text';
    const code = match[2].trimEnd();
    segments.push(
      <Box
        key={key++}
        as="pre"
        mt={2} mb={2}
        p="10px 12px"
        bg={colors.panel}
        borderRadius="4px"
        border={`1px solid ${colors.sidebarBorder}`}
        fontSize="11.5px"
        fontFamily="'JetBrains Mono', 'Fira Code', monospace"
        overflowX="auto"
        whiteSpace="pre"
        color={colors.fg}
        position="relative"
      >
        {lang && (
          <Text
            as="span"
            position="absolute"
            top="4px"
            right="8px"
            fontSize="9px"
            color={colors.fgMuted}
            textTransform="uppercase"
            letterSpacing="0.06em"
          >
            {lang}
          </Text>
        )}
        {code}
      </Box>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push(<InlineMarkdown key={key++} text={text.slice(lastIndex)} />);
  }

  return segments;
}

/** Render a run of text with inline-code and **bold** markers. */
function InlineMarkdown({ text }: { text: string }) {
  const colors = useVSColors();
  // Split on inline code `...` and bold **...**
  const parts: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<span key={k++}>{text.slice(last, m.index)}</span>);
    }
    const token = m[0];
    if (token.startsWith('`')) {
      parts.push(
        <Box
          key={k++}
          as="code"
          px="4px" py="1px"
          bg="rgba(0,0,0,0.35)"
          borderRadius="3px"
          fontFamily="'JetBrains Mono', 'Fira Code', monospace"
          fontSize="11.5px"
          color="#ce9178"
          display="inline"
        >
          {token.slice(1, -1)}
        </Box>
      );
    } else {
      parts.push(<Box key={k++} as="strong" fontWeight="600" display="inline">{token.slice(2, -2)}</Box>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(<span key={k++}>{text.slice(last)}</span>);

  // Preserve line-breaks in plain text segments
  return (
    <Text
      as="span"
      display="block"
      whiteSpace="pre-wrap"
      lineHeight="1.7"
      fontSize="13px"
      color={colors.fg}
    >
      {parts}
    </Text>
  );
}

// ─── Loading dots ─────────────────────────────────────────────────────────────

function TypingDots() {
  const colors = useVSColors();
  return (
    <Flex align="center" gap="4px" h="20px">
      {[0, 0.2, 0.4].map((delay, i) => (
        <Box
          key={i}
          w="6px" h="6px"
          borderRadius="full"
          bg={colors.fgMuted}
          animation={`${dotBounce} 1.2s ease-in-out ${delay}s infinite`}
        />
      ))}
    </Flex>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: LocalMessage }) {
  const colors = useVSColors();
  const isUser      = msg.role === 'user';
  const isSystem    = msg.role === 'system';
  const isAssistant = msg.role === 'assistant';

  if (isSystem) {
    return (
      <Flex justify="center" my={1}>
        <Text
          fontSize="10px"
          color={colors.fgMuted}
          bg={colors.sectionHeader}
          px="10px" py="3px"
          borderRadius="full"
          opacity={0.6}
          letterSpacing="0.03em"
        >
          {msg.content}
        </Text>
      </Flex>
    );
  }

  return (
    <Flex
      direction="column"
      align={isUser ? 'flex-end' : 'flex-start'}
      mb={3}
      px={3}
    >
      {/* Avatar row */}
      <Flex align="center" gap={2} mb="4px" flexDir={isUser ? 'row-reverse' : 'row'}>
        <Flex
          w="22px" h="22px"
          borderRadius="full"
          align="center"
          justify="center"
          bg={isUser ? '#007acc' : colors.sectionHeader}
          flexShrink={0}
        >
          <Icon
            as={(isUser ? FiUser : FiCpu) as ComponentType}
            boxSize="11px"
            color={isUser ? 'white' : colors.fgMuted}
          />
        </Flex>
        <Text fontSize="10px" color={colors.fgMuted} opacity={0.6}>
          {isUser ? 'You' : 'AI Assistant'}
        </Text>
      </Flex>

      {/* Bubble */}
      <Box
        maxW="92%"
        px="12px"
        py="8px"
        borderRadius={isUser ? '10px 4px 10px 10px' : '4px 10px 10px 10px'}
        bg={isUser ? colors.selected : colors.sectionHeader}
        border={isAssistant ? `1px solid ${colors.panelBorder}` : 'none'}
        boxShadow={isUser ? '0 1px 3px rgba(0,0,0,0.3)' : 'none'}
      >
        {msg.isLoading ? (
          <TypingDots />
        ) : isUser ? (
          <Text fontSize="13px" color={colors.fgActive} whiteSpace="pre-wrap" lineHeight="1.7">
            {msg.content}
          </Text>
        ) : (
          <>
            {renderMarkdown(msg.content, colors)}
          </>
        )}
      </Box>
    </Flex>
  );
}

// ─── Welcome screen ───────────────────────────────────────────────────────────

interface WelcomeProps {
  hasJob: boolean;
  onPrompt: (text: string) => void;
}

function WelcomeScreen({ hasJob, onPrompt }: WelcomeProps) {
  const colors = useVSColors();
  const generalPrompts = [
    { icon: FiBook,        label: 'How does the migration pipeline work?' },
    { icon: FiCode,        label: 'What is Pick Basic?' },
    { icon: FiZap,         label: 'What can you help me with?' },
    { icon: FiAlertCircle, label: 'What are common migration pitfalls?' },
  ];

  const jobPrompts = [
    { icon: FiBook,        label: 'Explain this YAML schema' },
    { icon: FiAlertCircle, label: 'Any potential migration issues?' },
    { icon: FiCode,        label: 'What business rules are extracted?' },
    { icon: FiZap,         label: 'How complex is this program?' },
  ];

  const prompts = hasJob ? jobPrompts : generalPrompts;

  return (
    <VStack flex={1} justify="center" align="stretch" px={3} pb={4} spacing={0}>
      <VStack spacing={2} mb={5} align="center">
        <Flex
          w="40px" h="40px"
          borderRadius="8px"
          bg={colors.sectionHeader}
          align="center"
          justify="center"
        >
          <Icon as={FiMessageSquare as ComponentType} boxSize="18px" color={colors.fgMuted} />
        </Flex>
        <Text fontSize="13px" fontWeight="500" color={colors.fg} opacity={0.6}>
          {hasJob ? 'Ask about this job' : 'AI migration assistant'}
        </Text>
        <Text fontSize="11px" color={colors.fgMuted} opacity={0.45} textAlign="center" lineHeight="1.5">
          {hasJob
            ? 'I have context about the currently selected job'
            : 'Select a job for context-aware answers'}
        </Text>
      </VStack>

      <VStack spacing={2} align="stretch">
        {prompts.map(({ icon, label }) => (
          <Flex
            key={label}
            align="center"
            gap={3}
            px="10px"
            py="8px"
            borderRadius="6px"
            bg={colors.sectionHeader}
            border={`1px solid ${colors.panelBorder}`}
            cursor="pointer"
            opacity={0.75}
            _hover={{ opacity: 1, bg: colors.hover, borderColor: '#555' }}
            transition="all 0.15s"
            onClick={() => onPrompt(label)}
            userSelect="none"
          >
            <Icon as={icon as ComponentType} boxSize="13px" color={colors.fgMuted} flexShrink={0} />
            <Text fontSize="12px" color={colors.fg}>{label}</Text>
          </Flex>
        ))}
      </VStack>
    </VStack>
  );
}

// ─── Line Comment Chip ────────────────────────────────────────────────────────

interface LineCommentChipProps {
  comment: PendingLineComment;
  onRemove: (id: string) => void;
}

function LineCommentChip({ comment, onRemove }: LineCommentChipProps) {
  const colors = useVSColors();
  const codePreview = comment.codeLine
    ? (comment.codeLine.length > 28 ? comment.codeLine.slice(0, 28) + '…' : comment.codeLine)
    : null;
  const label = codePreview
    ? `#L${comment.lineNumber}: \`${codePreview}\``
    : `#L${comment.lineNumber}: "${comment.text.length > 30 ? comment.text.slice(0, 30) + '…' : comment.text}"`;
  const tooltip = comment.codeLine
    ? `Line ${comment.lineNumber}: ${comment.codeLine}\n\nAnnotation: ${comment.text}`
    : `Line ${comment.lineNumber}: ${comment.text}`;
  return (
    <Flex
      align="center"
      gap="4px"
      px="7px"
      py="3px"
      borderRadius="4px"
      bg="rgba(0,122,204,0.18)"
      border="1px solid rgba(0,122,204,0.4)"
      maxW="240px"
      title={tooltip}
    >
      <Text
        fontSize="10px"
        color="#66b3e8"
        fontFamily="mono"
        whiteSpace="nowrap"
        overflow="hidden"
        textOverflow="ellipsis"
        flex={1}
      >
        {label}
      </Text>
      <IconButton
        aria-label={`Remove comment on line ${comment.lineNumber}`}
        icon={<Icon as={FiX as ComponentType} boxSize="9px" />}
        size="xs"
        variant="ghost"
        color="#66b3e8"
        minW="14px"
        h="14px"
        _hover={{ color: '#fc8181', bg: 'transparent' }}
        onClick={() => onRemove(comment.id)}
        flexShrink={0}
      />
    </Flex>
  );
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

let msgCounter = 0;
function newId() { return `msg-${++msgCounter}`; }

export default function ChatPanel({ jobId, lineComments = [], onRemoveLineComment }: ChatPanelProps) {
  const colors = useVSColors();
  const { user }   = useAuthStore();
  const performer  = user?.username ?? 'user';

  const [messages,   setMessages]   = useState<LocalMessage[]>([]);
  const [input,      setInput]      = useState('');
  const [isLoading,  setIsLoading]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const endRef     = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevJobId  = useRef<number | null>(null);

  // Job metadata for context badge
  const { data: job } = useJob(jobId ?? 0);

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // When job changes, insert a system notification
  useEffect(() => {
    if (jobId === prevJobId.current) return;
    prevJobId.current = jobId;

    if (jobId) {
      setMessages((prev) => [
        ...prev,
        {
          id:      newId(),
          role:    'system',
          content: `Switched context to Job #${jobId}`,
        },
      ]);
    } else if (messages.length > 0) {
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'system', content: 'Context cleared — no job selected' },
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    setInput('');

    // Optimistically add user message
    const userMsg: LocalMessage = { id: newId(), role: 'user', content: trimmed };
    const loadingMsg: LocalMessage = { id: newId(), role: 'assistant', content: '', isLoading: true };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setIsLoading(true);

    // Build history for API (exclude system messages and loading)
    const apiMessages: ChatMessage[] = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .filter((m) => !m.isLoading)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // Add the new user message to the history
    apiMessages.push({ role: 'user', content: trimmed });

    // Map pending line comment chips to the API format so the LLM knows
    // which specific lines the user is referring to in their question.
    // code_line carries the actual source code at that line so the LLM
    // can answer without guessing what the line contains.
    const chatLineComments: ChatLineComment[] = (lineComments ?? []).map((c) => ({
      line_number: c.lineNumber,
      text: c.text,
      code_line: c.codeLine,
      code_type: c.codeType,
    }));

    try {
      const res = await chatApi.send({
        messages: apiMessages,
        job_id: jobId ?? undefined,
        performed_by: performer,
        line_comments: chatLineComments.length > 0 ? chatLineComments : undefined,
      });

      // Clear the line comment chips — they've been consumed by this message
      if (chatLineComments.length > 0 && onRemoveLineComment) {
        (lineComments ?? []).forEach((c) => onRemoveLineComment(c.id));
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMsg.id
            ? { ...m, content: res.reply, isLoading: false }
            : m
        )
      );
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(errMsg);
      // Replace loading with error message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMsg.id
            ? { ...m, content: `⚠ ${errMsg}`, isLoading: false }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isLoading, jobId, messages, performer]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }, [input, sendMessage]);

  // Visible messages (filter out the "system" ones when they're the only content)
  const hasContent = messages.length > 0;
  const showWelcome = !hasContent;

  return (
    <Flex direction="column" h="100%" overflow="hidden" bg={colors.sidebar}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Flex
        h={`${VS.size.tabBar}px`}
        align="center"
        justify="space-between"
        px={3}
        bg={colors.sectionHeader}
        borderBottom={`1px solid ${colors.panelBorder}`}
        flexShrink={0}
        userSelect="none"
      >
        <HStack spacing={2}>
          <Text
            fontSize="11px"
            fontWeight="semibold"
            color={colors.fgMuted}
            textTransform="uppercase"
            letterSpacing="0.08em"
          >
            AI Assistant
          </Text>
          {jobId && job && (
            <Badge
              fontSize="9px"
              px="5px" py="1px"
              borderRadius="3px"
              bg={colors.selected}
              color={colors.statusBar}
              textTransform="none"
              fontWeight="normal"
            >
              Job #{jobId}
            </Badge>
          )}
        </HStack>

        <HStack spacing={0}>
          {hasContent && (
            <Tooltip label="Clear chat" hasArrow placement="bottom" openDelay={500}>
              <IconButton
                aria-label="Clear chat"
                icon={<Icon as={FiTrash2 as ComponentType} boxSize="12px" />}
                size="xs" variant="ghost"
                color={colors.fgMuted}
                _hover={{ color: '#fc8181', bg: colors.hover }}
                minW="22px" h="22px"
                onClick={clearChat}
              />
            </Tooltip>
          )}
        </HStack>
      </Flex>

      {/* ── Error strip ────────────────────────────────────────────────────── */}
      {error && (
        <Flex
          px={3} py="6px"
          bg="rgba(252,129,129,0.12)"
          borderBottom="1px solid rgba(252,129,129,0.2)"
          align="center"
          justify="space-between"
          flexShrink={0}
        >
          <Text fontSize="11px" color="#fc8181">{error}</Text>
          <IconButton
            aria-label="Dismiss error"
            icon={<Icon as={FiX as ComponentType} boxSize="10px" />}
            size="xs" variant="ghost" color="#fc8181"
            minW="18px" h="18px"
            onClick={() => setError(null)}
          />
        </Flex>
      )}

      {/* ── Messages / Welcome ─────────────────────────────────────────────── */}
      {showWelcome ? (
        <WelcomeScreen hasJob={!!jobId} onPrompt={(p) => sendMessage(p)} />
      ) : (
        <Box
          flex={1}
          overflowY="auto"
          pt={3}
          css={{
            '&::-webkit-scrollbar': { width: '4px' },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
            '&::-webkit-scrollbar-thumb': { background: colors.scrollbar, borderRadius: '4px' },
          }}
        >
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          <div ref={endRef} />
        </Box>
      )}

      {/* ── Input area ─────────────────────────────────────────────────────── */}
      <Box
        flexShrink={0}
        borderTop={`1px solid ${colors.panelBorder}`}
        bg={colors.sidebar}
        px={3}
        pt={2}
        pb={3}
      >
        <Flex direction="column" gap={2}>
          {/* ── Line comment chips ──────────────────────────────── */}
          {lineComments.length > 0 && (
            <Wrap spacing="5px" pb={1} borderBottom={`1px solid ${colors.panelBorder}`}>
              {lineComments.map(c => (
                <WrapItem key={c.id}>
                  <LineCommentChip
                    comment={c}
                    onRemove={onRemoveLineComment ?? (() => {})}
                  />
                </WrapItem>
              ))}
            </Wrap>
          )}
          <Flex
            align="flex-end"
            gap={2}
            bg={colors.input}
            borderRadius="6px"
            border={`1px solid ${colors.inputBorder}`}
            _focusWithin={{ borderColor: '#007acc', boxShadow: '0 0 0 1px #007acc' }}
            transition="border-color 0.15s, box-shadow 0.15s"
            px={2}
            py={2}
          >
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                jobId
                  ? `Ask about Job #${jobId}…`
                  : 'Ask anything about Pick Basic migration…'
              }
              resize="none"
              minH="36px"
              maxH="120px"
              overflow="auto"
              fontSize="13px"
              lineHeight="1.6"
              color={colors.fg}
              bg="transparent"
              border="none"
              _focus={{ border: 'none', boxShadow: 'none' }}
              _placeholder={{ color: colors.fgMuted, opacity: 0.5 }}
              p={0}
              flex={1}
              disabled={isLoading}
              rows={1}
              sx={{
                '&::-webkit-scrollbar': { width: '3px' },
                '&::-webkit-scrollbar-thumb': { background: colors.scrollbar },
              }}
            />
            <Tooltip
              label={isLoading ? 'Waiting…' : 'Send (Enter)'}
              hasArrow
              placement="top"
              openDelay={500}
            >
              <IconButton
                aria-label="Send message"
                icon={<Icon as={FiSend as ComponentType} boxSize="13px" />}
                size="xs"
                colorScheme="blue"
                variant={input.trim() ? 'solid' : 'ghost'}
                isLoading={isLoading}
                isDisabled={!input.trim() || isLoading}
                onClick={() => sendMessage(input)}
                minW="28px"
                h="28px"
                mb="1px"
                flexShrink={0}
              />
            </Tooltip>
          </Flex>

          <Text fontSize="10px" color={colors.fgMuted} opacity={0.35} textAlign="center">
            Enter to send · Shift+Enter for new line
          </Text>
        </Flex>
      </Box>
    </Flex>
  );
}
