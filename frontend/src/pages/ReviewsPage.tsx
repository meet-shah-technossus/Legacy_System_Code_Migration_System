import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  FormControl,
  FormLabel,
  FormHelperText,
  Heading,
  HStack,
  Icon,
  IconButton,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Radio,
  RadioGroup,
  Select,
  Spinner,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  Text,
  Textarea,
  Tooltip,
  useColorModeValue,
  useDisclosure,
  VStack,
} from '@chakra-ui/react';
import {
  FiCheckCircle,
  FiClock,
  FiCode,
  FiExternalLink,
  FiMessageSquare,
  FiPlus,
  FiRefreshCw,
  FiThumbsDown,
  FiThumbsUp,
  FiTrash2,
  FiXCircle,
} from 'react-icons/fi';
import { MdRateReview } from 'react-icons/md';
import { useJobs } from '../hooks/useJobs';
import { useLatestYAML } from '../hooks/useYaml';
import { useSubmitReview, useReviews } from '../hooks/useReviews';
import { useCodeReviews, useSubmitCodeReview } from '../hooks/useCodeReview';
import { useGeneratedCode } from '../hooks/useCode';
import { useRecentAuditLogs } from '../hooks/useAudit';
import { useAuthStore } from '../store/authStore';
import { usePrefsStore } from '../store/prefsStore';
import {
  formatDateTime,
  timeAgo,
  stateColorScheme,
  stateLabel,
  languageLabel,
  reviewDecisionLabel,
  reviewDecisionColorScheme,
} from '../utils/format';
import type { MigrationJobSummary, ReviewDecision } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InlineComment {
  section: string;
  comment_text: string;
  severity: 'info' | 'warning' | 'error' | 'blocking';
}

// ─── Review Modal ─────────────────────────────────────────────────────────────

function ReviewModal({
  job,
  isOpen,
  onClose,
}: {
  job: MigrationJobSummary;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { user } = useAuthStore();
  const [decision, setDecision] = useState<
    'APPROVE' | 'APPROVE_WITH_COMMENTS' | 'REJECT_REGENERATE'
  >('APPROVE');
  const [generalComment, setGeneralComment] = useState('');
  const [inlineComments, setInlineComments] = useState<InlineComment[]>([]);
  const submitReview = useSubmitReview(job.id);
  const { data: latestYaml, isLoading: yamlLoading } = useLatestYAML(job.id, false);

  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const commentBg = useColorModeValue('gray.50', 'gray.800');

  const handleAddComment = () => {
    setInlineComments((prev) => [
      ...prev,
      { section: '', comment_text: '', severity: 'info' },
    ]);
  };

  const handleRemoveComment = (index: number) => {
    setInlineComments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCommentChange = (
    index: number,
    field: keyof InlineComment,
    value: string
  ) => {
    setInlineComments((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  };

  const handleSubmit = useCallback(async () => {
    if (!latestYaml) return;
    await submitReview.mutateAsync({
      data: {
        yaml_version_id: latestYaml.id,
        decision,
        general_comment: generalComment || undefined,
        comments: inlineComments.filter((c) => c.comment_text.trim()),
      },
      performedBy: user?.username,
    });
    onClose();
    // Reset form
    setDecision('APPROVE');
    setGeneralComment('');
    setInlineComments([]);
  }, [latestYaml, decision, generalComment, inlineComments, submitReview, user, onClose]);

  const decisionConfig: Record<
    'APPROVE' | 'APPROVE_WITH_COMMENTS' | 'REJECT_REGENERATE',
    {
      color: string;
      icon: typeof FiCheckCircle;
      label: string;
      description: string;
    }
  > = {
    APPROVE: {
      color: 'green',
      icon: FiCheckCircle,
      label: 'Approve YAML',
      description: 'YAML looks good — proceed to code generation.',
    },
    APPROVE_WITH_COMMENTS: {
      color: 'teal',
      icon: FiMessageSquare,
      label: 'Approve with Comments',
      description: 'Approve but note issues for future reference.',
    },
    REJECT_REGENERATE: {
      color: 'red',
      icon: FiXCircle,
      label: 'Reject — Request Regeneration',
      description: 'YAML needs rework. LLM will regenerate using your feedback.',
    },
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent>
        <ModalHeader>
          <VStack align="start" spacing={1}>
            <HStack spacing={2}>
              <Icon as={MdRateReview} color="orange.400" />
              <Text>Submit Review</Text>
            </HStack>
            <HStack spacing={2}>
              <Text fontSize="sm" fontWeight="normal" color="gray.400">
                Job #{job.id} ·
              </Text>
              <Text fontSize="sm" fontWeight="normal" color="gray.300">
                {job.job_name ?? `Job #${job.id}`}
              </Text>
              <Badge colorScheme="cyan" variant="subtle" fontSize="xs">
                {languageLabel(job.target_language)}
              </Badge>
            </HStack>
          </VStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          {yamlLoading ? (
            <Flex justify="center" py={6}>
              <Spinner color="brand.400" />
            </Flex>
          ) : !latestYaml ? (
            <Alert status="warning" borderRadius="lg">
              <AlertIcon />
              <AlertDescription>No YAML version found for this job.</AlertDescription>
            </Alert>
          ) : (
            <VStack spacing={5} align="stretch">
              {/* YAML version info */}
              <Box
                p={3}
                bg={commentBg}
                borderRadius="lg"
                border="1px solid"
                borderColor={borderColor}
              >
                <HStack spacing={3}>
                  <Text fontSize="xs" color="gray.400">Reviewing YAML version</Text>
                  <Badge colorScheme="purple" variant="outline" fontFamily="mono">
                    v{latestYaml.version_number}
                  </Badge>
                  <Badge
                    colorScheme={latestYaml.is_valid ? 'green' : 'red'}
                    variant="subtle"
                    fontSize="xs"
                  >
                    {latestYaml.is_valid ? '✓ Valid' : '✗ Invalid'}
                  </Badge>
                </HStack>
              </Box>

              {/* Decision */}
              <FormControl>
                <FormLabel fontSize="sm" fontWeight="semibold">Decision *</FormLabel>
                <RadioGroup
                  value={decision}
                  onChange={(v) =>
                    setDecision(v as 'APPROVE' | 'APPROVE_WITH_COMMENTS' | 'REJECT_REGENERATE')
                  }
                >
                  <VStack spacing={2} align="stretch">
                    {(
                      ['APPROVE', 'APPROVE_WITH_COMMENTS', 'REJECT_REGENERATE'] as const
                    ).map((d) => {
                      const cfg = decisionConfig[d];
                      const isSelected = decision === d;
                      return (
                        <Box
                          key={d}
                          p={3}
                          borderRadius="lg"
                          border="2px solid"
                          borderColor={isSelected ? `${cfg.color}.400` : borderColor}
                          bg={isSelected ? `${cfg.color}.900` : 'transparent'}
                          cursor="pointer"
                          onClick={() => setDecision(d)}
                          transition="all 0.15s"
                        >
                          <HStack spacing={3}>
                            <Radio value={d} colorScheme={cfg.color} />
                            <Icon as={cfg.icon} color={`${cfg.color}.400`} />
                            <VStack align="start" spacing={0}>
                              <Text fontSize="sm" fontWeight="medium">{cfg.label}</Text>
                              <Text fontSize="xs" color="gray.400">{cfg.description}</Text>
                            </VStack>
                          </HStack>
                        </Box>
                      );
                    })}
                  </VStack>
                </RadioGroup>
              </FormControl>

              {/* General comment */}
              <FormControl>
                <FormLabel fontSize="sm" fontWeight="semibold">General Comment</FormLabel>
                <Textarea
                  placeholder={
                    decision === 'REJECT_REGENERATE'
                      ? 'Describe what needs to be fixed… (sent to LLM as regeneration context)'
                      : 'Overall feedback on the YAML quality…'
                  }
                  value={generalComment}
                  onChange={(e) => setGeneralComment(e.target.value)}
                  rows={3}
                  fontSize="sm"
                />
                {decision === 'REJECT_REGENERATE' && (
                  <FormHelperText color="orange.400" fontSize="xs">
                    This comment is passed to the LLM when regenerating YAML.
                  </FormHelperText>
                )}
              </FormControl>

              {/* Inline comments */}
              <FormControl>
                <Flex justify="space-between" align="center" mb={2}>
                  <FormLabel fontSize="sm" fontWeight="semibold" mb={0}>
                    Section Comments
                    {inlineComments.length > 0 && (
                      <Badge ml={2} colorScheme="purple" variant="subtle">
                        {inlineComments.length}
                      </Badge>
                    )}
                  </FormLabel>
                  <Button
                    size="xs"
                    leftIcon={<FiPlus />}
                    variant="outline"
                    onClick={handleAddComment}
                  >
                    Add comment
                  </Button>
                </Flex>

                <VStack spacing={2} align="stretch">
                  {inlineComments.map((c, i) => (
                    <Box
                      key={i}
                      p={3}
                      bg={commentBg}
                      borderRadius="lg"
                      border="1px solid"
                      borderColor={borderColor}
                    >
                      <HStack spacing={2} mb={2}>
                        <Input
                          placeholder="Section (e.g. subroutines)"
                          value={c.section}
                          onChange={(e) => handleCommentChange(i, 'section', e.target.value)}
                          size="xs"
                          maxW="160px"
                        />
                        <Select
                          size="xs"
                          value={c.severity}
                          onChange={(e) =>
                            handleCommentChange(i, 'severity', e.target.value)
                          }
                          maxW="120px"
                        >
                          <option value="info">Info</option>
                          <option value="warning">Warning</option>
                          <option value="error">Error</option>
                          <option value="blocking">Blocking</option>
                        </Select>
                        <IconButton
                          aria-label="Remove comment"
                          icon={<FiTrash2 />}
                          size="xs"
                          variant="ghost"
                          colorScheme="red"
                          onClick={() => handleRemoveComment(i)}
                        />
                      </HStack>
                      <Textarea
                        placeholder="Comment text…"
                        value={c.comment_text}
                        onChange={(e) => handleCommentChange(i, 'comment_text', e.target.value)}
                        size="xs"
                        rows={2}
                      />
                    </Box>
                  ))}
                </VStack>
              </FormControl>
            </VStack>
          )}
        </ModalBody>

        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            colorScheme={decisionConfig[decision].color}
            leftIcon={<Icon as={decisionConfig[decision].icon} />}
            isLoading={submitReview.isPending}
            isDisabled={!latestYaml}
            onClick={handleSubmit}
          >
            {decisionConfig[decision].label}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ─── Code Review Modal ────────────────────────────────────────────────────────

function CodeReviewModal({
  job,
  isOpen,
  onClose,
}: {
  job: MigrationJobSummary;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { user } = useAuthStore();
  const [decision, setDecision] = useState<'CODE_APPROVE' | 'CODE_REJECT_REGENERATE'>('CODE_APPROVE');
  const [generalComment, setGeneralComment] = useState('');
  const submitCodeReview = useSubmitCodeReview(job.id);
  const { data: code, isLoading: codeLoading } = useGeneratedCode(job.id);
  const { data: codeReviews } = useCodeReviews(job.id);

  const borderColor = useColorModeValue('gray.200', 'gray.700');

  const handleClose = () => {
    setDecision('CODE_APPROVE');
    setGeneralComment('');
    onClose();
  };

  const handleSubmit = () => {
    if (!code) return;

    submitCodeReview.mutate(
      {
        decision,
        general_comment: generalComment.trim() || undefined,
        reviewed_by: user?.username,
      },
      {
        onSuccess: () => handleClose(),
      }
    );
  };

  const decisionConfig: Record<
    'CODE_APPROVE' | 'CODE_REJECT_REGENERATE',
    {
      color: string;
      icon: typeof FiCheckCircle;
      label: string;
      description: string;
    }
  > = {
    CODE_APPROVE: {
      color: 'green',
      icon: FiCheckCircle,
      label: 'Accept Code',
      description: 'Code looks good — mark as accepted and complete the job.',
    },
    CODE_REJECT_REGENERATE: {
      color: 'red',
      icon: FiXCircle,
      label: 'Reject — Request Regeneration',
      description: 'Code needs rework. LLM will regenerate using your feedback.',
    },
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="4xl" scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent maxH="90vh">
        <ModalHeader>
          <VStack align="start" spacing={1}>
            <HStack spacing={2}>
              <Icon as={FiCode} color="purple.400" />
              <Text>Review Generated Code</Text>
            </HStack>
            <HStack spacing={2}>
              <Text fontSize="sm" fontWeight="normal" color="gray.400">
                Job #{job.id} ·
              </Text>
              <Text fontSize="sm" fontWeight="normal" color="gray.300">
                {job.job_name ?? `Job #${job.id}`}
              </Text>
              <Badge colorScheme="cyan" fontSize="xs">
                {languageLabel(job.target_language)}
              </Badge>
            </HStack>
          </VStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <VStack spacing={5} align="stretch">
            {codeLoading ? (
              <Flex justify="center" py={8}>
                <Spinner size="lg" color="purple.400" />
              </Flex>
            ) : !code ? (
              <Alert status="warning" borderRadius="lg">
                <AlertIcon />
                <AlertDescription>No generated code found for this job.</AlertDescription>
              </Alert>
            ) : (
              <>
                {/* Code info */}
                <Box
                  p={3}
                  bg={useColorModeValue('gray.50', 'gray.900')}
                  borderRadius="lg"
                  border="1px solid"
                  borderColor={borderColor}
                >
                  <HStack spacing={4} fontSize="sm">
                    <VStack align="start" spacing={0.5}>
                      <Text fontSize="xs" color="gray.400" fontWeight="semibold">
                        LINES
                      </Text>
                      <Text>{code.estimated_lines_of_code ?? '—'}</Text>
                    </VStack>
                    <VStack align="start" spacing={0.5}>
                      <Text fontSize="xs" color="gray.400" fontWeight="semibold">
                        MODEL
                      </Text>
                      <Text fontFamily="mono" fontSize="xs">
                        {code.llm_model_used ?? '—'}
                      </Text>
                    </VStack>
                    <VStack align="start" spacing={0.5}>
                      <Text fontSize="xs" color="gray.400" fontWeight="semibold">
                        GENERATED
                      </Text>
                      <Text fontSize="xs">{timeAgo(code.generated_at)}</Text>
                    </VStack>
                  </HStack>
                </Box>

                {/* Code viewer */}
                <Box
                  border="1px solid"
                  borderColor={borderColor}
                  borderRadius="lg"
                  overflow="hidden"
                  maxH="400px"
                  overflowY="auto"
                  bg={useColorModeValue('gray.900', 'gray.950')}
                >
                  <Box
                    as="pre"
                    p={4}
                    fontSize="xs"
                    lineHeight={1.7}
                    color="gray.100"
                    fontFamily="'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace"
                    whiteSpace="pre-wrap"
                    wordBreak="break-word"
                  >
                    {code.code_content}
                  </Box>
                </Box>

                {/* Review history */}
                {codeReviews && codeReviews.length > 0 && (
                  <Box>
                    <Text fontSize="sm" fontWeight="semibold" mb={2} color="gray.400">
                      Previous Reviews ({codeReviews.length})
                    </Text>
                    <VStack spacing={2} align="stretch">
                      {codeReviews.slice(0, 5).map((review) => (
                        <Box
                          key={review.id}
                          p={3}
                          border="1px solid"
                          borderColor={borderColor}
                          borderRadius="md"
                          fontSize="sm"
                        >
                          <HStack spacing={2} mb={review.general_comment ? 2 : 0}>
                            <Badge
                              colorScheme={
                                review.decision === 'CODE_APPROVE' ? 'green' : 'red'
                              }
                              fontSize="xs"
                            >
                              {reviewDecisionLabel(review.decision)}
                            </Badge>
                            {review.reviewed_by && (
                              <Text fontSize="xs" color="gray.400">
                                by {review.reviewed_by}
                              </Text>
                            )}
                            <Text fontSize="xs" color="gray.500" ml="auto">
                              {timeAgo(review.reviewed_at)}
                            </Text>
                          </HStack>
                          {review.general_comment && (
                            <Text fontSize="xs" color="gray.300">
                              {review.general_comment}
                            </Text>
                          )}
                        </Box>
                      ))}
                    </VStack>
                  </Box>
                )}

                {/* Decision */}
                <FormControl>
                  <FormLabel fontSize="sm" fontWeight="semibold">
                    Decision *
                  </FormLabel>
                  <RadioGroup
                    value={decision}
                    onChange={(v) =>
                      setDecision(v as 'CODE_APPROVE' | 'CODE_REJECT_REGENERATE')
                    }
                  >
                    <VStack spacing={2} align="stretch">
                      {(['CODE_APPROVE', 'CODE_REJECT_REGENERATE'] as const).map((d) => {
                        const cfg = decisionConfig[d];
                        const isSelected = decision === d;
                        return (
                          <Box
                            key={d}
                            p={3}
                            borderRadius="lg"
                            border="2px solid"
                            borderColor={isSelected ? `${cfg.color}.400` : borderColor}
                            bg={isSelected ? `${cfg.color}.900` : 'transparent'}
                            cursor="pointer"
                            onClick={() => setDecision(d)}
                            transition="all 0.15s"
                          >
                            <HStack spacing={3}>
                              <Radio value={d} colorScheme={cfg.color} />
                              <Icon as={cfg.icon} color={`${cfg.color}.400`} boxSize={4} />
                              <VStack align="start" spacing={0.5} flex={1}>
                                <Text fontSize="sm" fontWeight="semibold">
                                  {cfg.label}
                                </Text>
                                <Text fontSize="xs" color="gray.400">
                                  {cfg.description}
                                </Text>
                              </VStack>
                            </HStack>
                          </Box>
                        );
                      })}
                    </VStack>
                  </RadioGroup>
                </FormControl>

                {/* General comment */}
                <FormControl>
                  <FormLabel fontSize="sm" fontWeight="semibold">
                    Comments
                    {decision === 'CODE_REJECT_REGENERATE' && (
                      <Text as="span" color="red.400" ml={1}>
                        (Required for rejection)
                      </Text>
                    )}
                  </FormLabel>
                  <Textarea
                    value={generalComment}
                    onChange={(e) => setGeneralComment(e.target.value)}
                    placeholder={
                      decision === 'CODE_APPROVE'
                        ? 'Optional notes about the code (visible in audit logs)'
                        : 'Explain what needs to be improved. The LLM will use this feedback to regenerate.'
                    }
                    rows={4}
                    fontSize="sm"
                  />
                  <FormHelperText fontSize="xs">
                    {decision === 'CODE_REJECT_REGENERATE'
                      ? 'Be specific — this feedback guides the next generation attempt.'
                      : 'Optional acceptance notes for the audit trail.'}
                  </FormHelperText>
                </FormControl>
              </>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            colorScheme={decisionConfig[decision].color}
            leftIcon={<Icon as={decisionConfig[decision].icon} />}
            isLoading={submitCodeReview.isPending}
            isDisabled={
              !code ||
              (decision === 'CODE_REJECT_REGENERATE' && !generalComment.trim())
            }
            onClick={handleSubmit}
          >
            {decisionConfig[decision].label}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ─── Job review card ──────────────────────────────────────────────────────────

function PendingJobCard({
  job,
  onReview,
}: {
  job: MigrationJobSummary;
  onReview: (job: MigrationJobSummary) => void;
}) {
  const navigate = useNavigate();
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const hoverBg = useColorModeValue('gray.50', 'gray.750');
  const useAbsoluteTimestamps = usePrefsStore((s) => s.useAbsoluteTimestamps);

  return (
    <Box
      bg={bg}
      border="1px solid"
      borderColor={borderColor}
      borderRadius="xl"
      p={4}
      transition="all 0.2s"
      _hover={{ borderColor: 'orange.400', bg: hoverBg }}
    >
      <Flex align="start" justify="space-between" gap={3} flexWrap="wrap">
        <VStack align="start" spacing={1} flex={1} minW={0}>
          <HStack spacing={2} flexWrap="wrap">
            <Text fontWeight="semibold" noOfLines={1}>
              {job.job_name ?? `Job #${job.id}`}
            </Text>
            <Tag size="sm" fontFamily="mono" colorScheme="gray" variant="outline">
              #{job.id}
            </Tag>
          </HStack>

          <HStack spacing={2} flexWrap="wrap">
            <Badge colorScheme={stateColorScheme(job.current_state)} variant="subtle" fontSize="xs">
              {stateLabel(job.current_state)}
            </Badge>
            <Badge colorScheme="cyan" variant="subtle" fontSize="xs">
              {languageLabel(job.target_language)}
            </Badge>
          </HStack>

          <HStack spacing={1}>
            <Icon as={FiClock} boxSize={3} color="gray.400" />
            <Tooltip label={formatDateTime(job.updated_at)} hasArrow>
              <Text fontSize="xs" color="gray.400">
                Waiting {useAbsoluteTimestamps ? formatDateTime(job.updated_at) : timeAgo(job.updated_at)}
              </Text>
            </Tooltip>
          </HStack>
        </VStack>

        <HStack spacing={2} flexShrink={0}>
          <Tooltip label="Open job detail" hasArrow>
            <IconButton
              aria-label="View job"
              icon={<FiExternalLink />}
              size="sm"
              variant="ghost"
              onClick={() => navigate(`/jobs/${job.id}`)}
            />
          </Tooltip>
          <Button
            size="sm"
            colorScheme="orange"
            leftIcon={<Icon as={MdRateReview} />}
            onClick={() => onReview(job)}
          >
            Review Now
          </Button>
        </HStack>
      </Flex>
    </Box>
  );
}

// ─── Review history row ───────────────────────────────────────────────────────

function ReviewHistoryRow({
  jobId,
}: {
  jobId: number;
}) {
  const navigate = useNavigate();
  const { data: reviews, isLoading } = useReviews(jobId);
  const useAbsoluteTimestamps = usePrefsStore((s) => s.useAbsoluteTimestamps);
  const borderColor = useColorModeValue('gray.100', 'gray.700');
  const hoverBg = useColorModeValue('gray.50', 'gray.750');

  if (isLoading)
    return (
      <Flex py={2} justify="center">
        <Spinner size="xs" />
      </Flex>
    );

  if (!reviews || reviews.length === 0) return null;

  return (
    <>
      {reviews.slice(0, 3).map((r) => (
        <Flex
          key={r.id}
          px={4}
          py={2.5}
          align="center"
          gap={3}
          borderBottom="1px solid"
          borderColor={borderColor}
          _hover={{ bg: hoverBg }}
          flexWrap="wrap"
        >
          <Tag
            size="sm"
            fontFamily="mono"
            colorScheme="gray"
            variant="outline"
            cursor="pointer"
            onClick={() => navigate(`/jobs/${jobId}`)}
            flexShrink={0}
          >
            #{jobId} <Icon as={FiExternalLink} ml={1} boxSize={2.5} />
          </Tag>

          <Badge
            colorScheme={reviewDecisionColorScheme(r.decision)}
            variant="subtle"
            fontSize="xs"
            flexShrink={0}
          >
            {reviewDecisionLabel(r.decision)}
          </Badge>

          {r.performed_by && (
            <Text fontSize="xs" color="gray.400" flexShrink={0}>
              by {r.performed_by}
            </Text>
          )}

          {r.comments_count > 0 && (
            <HStack spacing={1} flexShrink={0}>
              <Icon as={FiMessageSquare} boxSize={3} color="gray.400" />
              <Text fontSize="xs" color="gray.400">{r.comments_count} comment{r.comments_count !== 1 ? 's' : ''}</Text>
            </HStack>
          )}

          <Tooltip label={formatDateTime(r.created_at)} hasArrow>
            <Text fontSize="xs" color="gray.500" ml="auto">
              {useAbsoluteTimestamps ? formatDateTime(r.created_at) : timeAgo(r.created_at)}
            </Text>
          </Tooltip>
        </Flex>
      ))}
    </>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
}) {
  return (
    <Flex direction="column" align="center" py={16} gap={3}>
      <Icon as={icon} boxSize={12} color="gray.500" />
      <Text fontWeight="semibold" color="gray.300">{title}</Text>
      <Text fontSize="sm" color="gray.500" textAlign="center" maxW="360px">
        {subtitle}
      </Text>
    </Flex>
  );
}

// ─── Reviews Page ─────────────────────────────────────────────────────────────

export default function ReviewsPage() {
  const [selectedJob, setSelectedJob] = useState<MigrationJobSummary | null>(null);
  const [selectedCodeReviewJob, setSelectedCodeReviewJob] = useState<MigrationJobSummary | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { 
    isOpen: isCodeReviewOpen, 
    onOpen: onCodeReviewOpen, 
    onClose: onCodeReviewClose 
  } = useDisclosure();
  const useAbsoluteTimestamps = usePrefsStore((s) => s.useAbsoluteTimestamps);

  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const headerBg = useColorModeValue('gray.50', 'gray.900');

  // Jobs awaiting review
  const {
    data: underReviewJobs,
    isLoading: underReviewLoading,
    isFetching: underReviewFetching,
    refetch: refetchUnder,
  } = useJobs({ state: 'UNDER_REVIEW', limit: 100 });

  // Jobs that had regeneration requested (reviewer may want to follow up)
  const {
    data: regenJobs,
    isLoading: regenLoading,
    isFetching: regenFetching,
    refetch: refetchRegen,
  } = useJobs({ state: 'REGENERATE_REQUESTED', limit: 100 });

  // Jobs where code regeneration was requested (Job 2 flow)
  const {
    data: codeRegenJobs,
    isLoading: codeRegenLoading,
    isFetching: codeRegenFetching,
    refetch: refetchCodeRegen,
  } = useJobs({ state: 'CODE_REGENERATE_REQUESTED', limit: 100 });

  // Jobs with code awaiting review
  const {
    data: codeUnderReviewJobs,
    isLoading: codeReviewLoading,
    isFetching: codeReviewFetching,
    refetch: refetchCodeReview,
  } = useJobs({ state: 'CODE_UNDER_REVIEW', limit: 100 });

  // Recent review-related audit events to find jobs with reviews
  const { data: auditData } = useRecentAuditLogs(200);
  const reviewedJobIds = [
    ...new Set(
      (auditData?.logs ?? [])
        .filter((l) => l.action === 'REVIEW_SUBMITTED' && l.job_id != null)
        .map((l) => l.job_id as number)
    ),
  ].slice(0, 20);

  const handleReview = (job: MigrationJobSummary) => {
    setSelectedJob(job);
    onOpen();
  };

  const handleCodeReview = (job: MigrationJobSummary) => {
    setSelectedCodeReviewJob(job);
    onCodeReviewOpen();
  };

  const handleModalClose = () => {
    onClose();
    setSelectedJob(null);
  };

  const handleCodeReviewModalClose = () => {
    onCodeReviewClose();
    setSelectedCodeReviewJob(null);
  };

  const pendingCount = underReviewJobs?.length ?? 0;
  const regenCount = (regenJobs?.length ?? 0) + (codeRegenJobs?.length ?? 0);
  const codeReviewCount = codeUnderReviewJobs?.length ?? 0;

  return (
    <Container maxW="5xl" py={6} px={{ base: 4, md: 8 }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <Flex align="center" justify="space-between" mb={6} gap={4} flexWrap="wrap">
        <HStack spacing={3}>
          <Icon as={MdRateReview} boxSize={6} color="orange.400" />
          <Heading size="lg">Reviews</Heading>
          {pendingCount > 0 && (
            <Badge colorScheme="orange" borderRadius="full" fontSize="sm" px={2}>
              {pendingCount} pending
            </Badge>
          )}
        </HStack>
      </Flex>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <Tabs variant="soft-rounded" colorScheme="orange" isLazy>
        <TabList
          bg={bg}
          border="1px solid"
          borderColor={borderColor}
          borderRadius="xl"
          p={2}
          mb={4}
        >
          <Tab fontSize="sm">
            <HStack spacing={1.5}>
              <Icon as={FiThumbsUp} boxSize={3.5} />
              <Text>Awaiting Review</Text>
              {pendingCount > 0 && (
                <Badge colorScheme="orange" variant="solid" borderRadius="full" fontSize="xs" px={1.5}>
                  {pendingCount}
                </Badge>
              )}
            </HStack>
          </Tab>
          <Tab fontSize="sm">
            <HStack spacing={1.5}>
              <Icon as={FiRefreshCw} boxSize={3.5} />
              <Text>Regeneration Requested</Text>
              {regenCount > 0 && (
                <Badge colorScheme="yellow" variant="solid" borderRadius="full" fontSize="xs" px={1.5}>
                  {regenCount}
                </Badge>
              )}
            </HStack>
          </Tab>
          <Tab fontSize="sm">
            <HStack spacing={1.5}>
              <Icon as={FiCode} boxSize={3.5} />
              <Text>Code Review</Text>
              {codeReviewCount > 0 && (
                <Badge colorScheme="purple" variant="solid" borderRadius="full" fontSize="xs" px={1.5}>
                  {codeReviewCount}
                </Badge>
              )}
            </HStack>
          </Tab>
          <Tab fontSize="sm">
            <HStack spacing={1.5}>
              <Icon as={FiMessageSquare} boxSize={3.5} />
              <Text>Recent Reviews</Text>
            </HStack>
          </Tab>
        </TabList>

        <TabPanels>
          {/* ── Awaiting Review ── */}
          <TabPanel p={0}>
            <Flex justify="space-between" align="center" mb={3}>
              <Text fontSize="sm" color="gray.400">
                {pendingCount} job{pendingCount !== 1 ? 's' : ''} waiting for review
              </Text>
              <IconButton
                aria-label="Refresh"
                icon={<FiRefreshCw />}
                size="sm"
                variant="ghost"
                isLoading={underReviewFetching}
                onClick={() => refetchUnder()}
              />
            </Flex>

            {underReviewLoading ? (
              <Flex justify="center" py={12}>
                <Spinner size="xl" color="orange.400" />
              </Flex>
            ) : !underReviewJobs || underReviewJobs.length === 0 ? (
              <Box
                bg={bg}
                border="1px solid"
                borderColor={borderColor}
                borderRadius="xl"
                overflow="hidden"
              >
                <EmptyState
                  icon={FiCheckCircle}
                  title="All caught up!"
                  subtitle="No jobs are currently awaiting review. When jobs transition to UNDER_REVIEW state they will appear here."
                />
              </Box>
            ) : (
              <VStack spacing={3} align="stretch">
                {underReviewJobs.map((job) => (
                  <PendingJobCard key={job.id} job={job} onReview={handleReview} />
                ))}
              </VStack>
            )}
          </TabPanel>

          {/* ── Regeneration Requested ── */}
          <TabPanel p={0}>
            <Flex justify="space-between" align="center" mb={3}>
              <Text fontSize="sm" color="gray.400">
                {regenCount} job{regenCount !== 1 ? 's' : ''} awaiting regeneration
              </Text>
              <HStack spacing={1}>
                <IconButton
                  aria-label="Refresh"
                  icon={<FiRefreshCw />}
                  size="sm"
                  variant="ghost"
                  isLoading={regenFetching || codeRegenFetching}
                  onClick={() => { refetchRegen(); refetchCodeRegen(); }}
                />
              </HStack>
            </Flex>

            {regenLoading || codeRegenLoading ? (
              <Flex justify="center" py={12}>
                <Spinner size="xl" color="yellow.400" />
              </Flex>
            ) : regenCount === 0 ? (
              <Box
                bg={bg}
                border="1px solid"
                borderColor={borderColor}
                borderRadius="xl"
                overflow="hidden"
              >
                <EmptyState
                  icon={FiRefreshCw}
                  title="No regenerations pending"
                  subtitle="Jobs rejected during review move here. Once YAML or code is regenerated they return to their respective review state."
                />
              </Box>
            ) : (
              <VStack spacing={4} align="stretch">
                {/* YAML Regeneration section */}
                {regenJobs && regenJobs.length > 0 && (
                  <Box>
                    <Text fontSize="xs" fontWeight="semibold" color="yellow.400" mb={2} textTransform="uppercase" letterSpacing="wider">
                      YAML Regeneration ({regenJobs.length})
                    </Text>
                    <VStack spacing={3} align="stretch">
                      {regenJobs.map((job) => (
                        <Box
                          key={job.id}
                          bg={bg}
                          border="1px solid"
                          borderColor={borderColor}
                          borderRadius="xl"
                          p={4}
                        >
                          <Flex align="start" justify="space-between" gap={3} flexWrap="wrap">
                            <VStack align="start" spacing={1}>
                              <HStack spacing={2}>
                                <Text fontWeight="semibold">
                                  {job.job_name ?? `Job #${job.id}`}
                                </Text>
                                <Tag size="sm" fontFamily="mono" colorScheme="gray" variant="outline">
                                  #{job.id}
                                </Tag>
                              </HStack>
                              <HStack spacing={2}>
                                <Badge colorScheme={stateColorScheme(job.current_state)} variant="subtle" fontSize="xs">
                                  {stateLabel(job.current_state)}
                                </Badge>
                                {job.target_language && (
                                  <Badge colorScheme="cyan" variant="subtle" fontSize="xs">
                                    {languageLabel(job.target_language)}
                                  </Badge>
                                )}
                              </HStack>
                              <Tooltip label={formatDateTime(job.updated_at)} hasArrow>
                                <Text fontSize="xs" color="gray.400">
                                  Requested {useAbsoluteTimestamps ? formatDateTime(job.updated_at) : timeAgo(job.updated_at)}
                                </Text>
                              </Tooltip>
                            </VStack>
                            <Button
                              size="sm"
                              variant="outline"
                              colorScheme="yellow"
                              leftIcon={<FiExternalLink />}
                              as="a"
                              href={`/jobs/${job.id}`}
                            >
                              View Job
                            </Button>
                          </Flex>
                        </Box>
                      ))}
                    </VStack>
                  </Box>
                )}

                {/* Code Regeneration section */}
                {codeRegenJobs && codeRegenJobs.length > 0 && (
                  <Box>
                    <Text fontSize="xs" fontWeight="semibold" color="pink.400" mb={2} textTransform="uppercase" letterSpacing="wider">
                      Code Regeneration ({codeRegenJobs.length})
                    </Text>
                    <VStack spacing={3} align="stretch">
                      {codeRegenJobs.map((job) => (
                        <Box
                          key={job.id}
                          bg={bg}
                          border="1px solid"
                          borderColor={borderColor}
                          borderRadius="xl"
                          p={4}
                        >
                          <Flex align="start" justify="space-between" gap={3} flexWrap="wrap">
                            <VStack align="start" spacing={1}>
                              <HStack spacing={2}>
                                <Text fontWeight="semibold">
                                  {job.job_name ?? `Job #${job.id}`}
                                </Text>
                                <Tag size="sm" fontFamily="mono" colorScheme="gray" variant="outline">
                                  #{job.id}
                                </Tag>
                                <Badge colorScheme="purple" variant="outline" fontSize="xs">Job 2</Badge>
                              </HStack>
                              <HStack spacing={2}>
                                <Badge colorScheme={stateColorScheme(job.current_state)} variant="subtle" fontSize="xs">
                                  {stateLabel(job.current_state)}
                                </Badge>
                                {job.target_language && (
                                  <Badge colorScheme="cyan" variant="subtle" fontSize="xs">
                                    {languageLabel(job.target_language)}
                                  </Badge>
                                )}
                              </HStack>
                              <Tooltip label={formatDateTime(job.updated_at)} hasArrow>
                                <Text fontSize="xs" color="gray.400">
                                  Requested {useAbsoluteTimestamps ? formatDateTime(job.updated_at) : timeAgo(job.updated_at)}
                                </Text>
                              </Tooltip>
                            </VStack>
                            <Button
                              size="sm"
                              variant="outline"
                              colorScheme="pink"
                              leftIcon={<FiExternalLink />}
                              as="a"
                              href={`/jobs/${job.id}`}
                            >
                              View Job
                            </Button>
                          </Flex>
                        </Box>
                      ))}
                    </VStack>
                  </Box>
                )}
              </VStack>
            )}
          </TabPanel>

          {/* ── Code Review ── */}
          <TabPanel p={0}>
            <Flex justify="space-between" align="center" mb={3}>
              <Text fontSize="sm" color="gray.400">
                {codeReviewCount} code{codeReviewCount !== 1 ? 's' : ''} awaiting review
              </Text>
              <IconButton
                aria-label="Refresh"
                icon={<FiRefreshCw />}
                size="sm"
                variant="ghost"
                isLoading={codeReviewFetching}
                onClick={() => refetchCodeReview()}
              />
            </Flex>

            {codeReviewLoading ? (
              <Flex justify="center" py={12}>
                <Spinner size="xl" color="purple.400" />
              </Flex>
            ) : !codeUnderReviewJobs || codeUnderReviewJobs.length === 0 ? (
              <Box
                bg={bg}
                border="1px solid"
                borderColor={borderColor}
                borderRadius="xl"
                overflow="hidden"
              >
                <EmptyState
                  icon={FiCode}
                  title="No code pending review"
                  subtitle="When generated code is ready for review, jobs will appear here. You can accept or reject the code."
                />
              </Box>
            ) : (
              <VStack spacing={3} align="stretch">
                {codeUnderReviewJobs.map((job) => (
                  <Box
                    key={job.id}
                    bg={bg}
                    border="1px solid"
                    borderColor={borderColor}
                    borderRadius="xl"
                    p={4}
                    transition="all 0.2s"
                    _hover={{ borderColor: 'purple.400', bg: useColorModeValue('gray.50', 'gray.750') }}
                  >
                    <Flex align="start" justify="space-between" gap={3} flexWrap="wrap">
                      <VStack align="start" spacing={1} flex={1} minW={0}>
                        <HStack spacing={2} flexWrap="wrap">
                          <Text fontWeight="semibold" noOfLines={1}>
                            {job.job_name ?? `Job #${job.id}`}
                          </Text>
                          <Tag size="sm" fontFamily="mono" colorScheme="gray" variant="outline">
                            #{job.id}
                          </Tag>
                        </HStack>

                        <HStack spacing={2} flexWrap="wrap">
                          <Badge colorScheme={stateColorScheme(job.current_state)} variant="subtle" fontSize="xs">
                            {stateLabel(job.current_state)}
                          </Badge>
                          {job.target_language && (
                            <Badge colorScheme="cyan" variant="subtle" fontSize="xs">
                              {languageLabel(job.target_language)}
                            </Badge>
                          )}
                          <Badge colorScheme="purple" variant="outline" fontSize="xs">Job 2</Badge>
                        </HStack>

                        <HStack spacing={1}>
                          <Icon as={FiClock} boxSize={3} color="gray.400" />
                          <Tooltip label={formatDateTime(job.updated_at)} hasArrow>
                            <Text fontSize="xs" color="gray.400">
                              Waiting {useAbsoluteTimestamps ? formatDateTime(job.updated_at) : timeAgo(job.updated_at)}
                            </Text>
                          </Tooltip>
                        </HStack>
                      </VStack>

                      <HStack spacing={2} flexShrink={0}>
                        <Tooltip label="Open job detail" hasArrow>
                          <IconButton
                            aria-label="View job"
                            icon={<FiExternalLink />}
                            size="sm"
                            variant="ghost"
                            as="a"
                            href={`/jobs/${job.id}`}
                          />
                        </Tooltip>
                        <Button
                          size="sm"
                          colorScheme="purple"
                          leftIcon={<Icon as={FiCode} />}
                          onClick={() => handleCodeReview(job)}
                        >
                          Review Code
                        </Button>
                      </HStack>
                    </Flex>
                  </Box>
                ))}
              </VStack>
            )}
          </TabPanel>

          {/* ── Recent Reviews ── */}
          <TabPanel p={0}>
            {reviewedJobIds.length === 0 ? (
              <Box
                bg={bg}
                border="1px solid"
                borderColor={borderColor}
                borderRadius="xl"
                overflow="hidden"
              >
                <EmptyState
                  icon={FiThumbsDown}
                  title="No reviews yet"
                  subtitle="Review history will appear here once reviews are submitted on any job."
                />
              </Box>
            ) : (
              <Box
                bg={bg}
                border="1px solid"
                borderColor={borderColor}
                borderRadius="xl"
                overflow="hidden"
              >
                {/* Header */}
                <Flex
                  bg={headerBg}
                  px={4}
                  py={2}
                  borderBottom="1px solid"
                  borderColor={borderColor}
                  gap={3}
                >
                  <Text fontSize="xs" fontWeight="semibold" color="gray.400" textTransform="uppercase" minW="60px">
                    Job
                  </Text>
                  <Text fontSize="xs" fontWeight="semibold" color="gray.400" textTransform="uppercase">
                    Decision / Reviewer / Comments
                  </Text>
                </Flex>

                {reviewedJobIds.map((jobId) => (
                  <ReviewHistoryRow key={jobId} jobId={jobId} />
                ))}
              </Box>
            )}
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* ── Review Modal ── */}
      {selectedJob && (
        <ReviewModal
          job={selectedJob}
          isOpen={isOpen}
          onClose={handleModalClose}
        />
      )}

      {/* ── Code Review Modal ── */}
      {selectedCodeReviewJob && (
        <CodeReviewModal
          job={selectedCodeReviewJob}
          isOpen={isCodeReviewOpen}
          onClose={handleCodeReviewModalClose}
        />
      )}
    </Container>
  );
}
