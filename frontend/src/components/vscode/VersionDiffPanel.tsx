/**
 * VersionDiffPanel.tsx
 *
 * GitHub-style line-by-line version diff with per-hunk keep / undo.
 *
 * Props
 * ─────
 * jobId      – job whose versions to compare
 * isYaml     – true → compare YAML versions; false → compare code versions
 * onApply    – called with the merged text when the user clicks "Apply"
 * onClose    – called when the user closes this panel
 */

import {
  Box,
  Flex,
  Text,
  Button,
  Select,
  HStack,
  Badge,
  IconButton,
  Spinner,
  Tooltip,
  Icon,
} from '@chakra-ui/react';
import type { ComponentType } from 'react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { diffLines, Change } from 'diff';
import { FiX, FiCheckCircle, FiRotateCcw, FiCheck, FiEdit2 } from 'react-icons/fi';
import { useVSColors } from './vscodeTheme';
import { useYAMLVersions, useYAMLVersion } from '../../hooks/useYaml';
import { useCodeVersions, useCodeVersion } from '../../hooks/useCode';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A diff hunk groups a consecutive block of removed + added lines */
interface DiffHunk {
  id: number;
  removedLines: string[];      // lines from the "from" version (shown in red)
  addedLines: string[];        // lines from the committed "to" version (shown in green)
  /** Draft lines for this hunk — only set when draft is active AND the user
   *  edited these specific lines. null = no draft change for this hunk. */
  draftLines: string[] | null;
  contextBefore: string[];     // unchanged lines just before this hunk (for context)
  /** Which version to include in the merged output:
   *  'committed' = use addedLines (green)
   *  'old'       = use removedLines (red)
   *  'draft'     = use draftLines (yellow, only valid when draftLines != null) */
  choice: 'committed' | 'old' | 'draft';
  /** Actual 1-based line number in the old file where removed lines begin */
  oldLineStart: number;
  /** Actual 1-based line number in the new file where added lines begin */
  newLineStart: number;
}

/** A run of unchanged lines between hunks */
interface ContextBlock {
  lines: string[];
  startLineOld: number;
}

// ─── Convert raw diff output into hunks ──────────────────────────────────────

/** Build diff hunks from raw `diff` output. */
function buildHunks(changes: Change[]): { hunks: DiffHunk[]; unchangedBefore: string[][] } {
  const hunks: DiffHunk[] = [];
  const unchangedBefore: string[][] = [];

  let hunkId = 0;
  let i = 0;

  // Running 1-based line counters for old and new files
  let oldLineNum = 1;
  let newLineNum = 1;

  // Collect unchanged context before each hunk (up to 3 lines)
  let pendingContext: string[] = [];

  const splitLines = (value: string) =>
    value.split('\n').filter((_, idx, arr) => idx < arr.length - 1 || arr[idx] !== '');

  while (i < changes.length) {
    const change = changes[i];

    if (!change.added && !change.removed) {
      // Unchanged block — advance both line counters and collect context
      const lines = splitLines(change.value);
      oldLineNum += lines.length;
      newLineNum += lines.length;
      pendingContext = lines.slice(-3);
      i++;
    } else {
      // Start of a hunk — record line starts BEFORE consuming the block
      const hunkOldStart = oldLineNum;
      const hunkNewStart = newLineNum;
      const removedLines: string[] = [];
      const addedLines: string[] = [];

      while (i < changes.length && (changes[i].removed || changes[i].added)) {
        const c = changes[i];
        const lines = splitLines(c.value);
        if (c.removed) {
          removedLines.push(...lines);
          oldLineNum += lines.length;
        } else {
          addedLines.push(...lines);
          newLineNum += lines.length;
        }
        i++;
      }

      if (removedLines.length > 0 || addedLines.length > 0) {
        hunks.push({
          id: hunkId++,
          removedLines,
          addedLines,
          draftLines: null,          // filled in later by draft correlation
          contextBefore: [...pendingContext],
          choice: 'committed',       // default: keep the committed version
          oldLineStart: hunkOldStart,
          newLineStart: hunkNewStart,
        });
        unchangedBefore.push([...pendingContext]);
      }
      pendingContext = [];
    }
  }

  return { hunks, unchangedBefore };
}

// ─── Reconstruct merged text from hunks ──────────────────────────────────────

function buildMergedText(oldText: string, changes: Change[], hunks: DiffHunk[]): string {
  const result: string[] = [];
  let hunkIdx = 0;

  for (const change of changes) {
    if (!change.added && !change.removed) {
      // Unchanged block
      const lines = change.value.split('\n');
      result.push(...lines);
    } else if (change.removed) {
      // Output removed lines only when user chose 'old' for this hunk
      const hunk = hunks[hunkIdx];
      if (hunk?.choice === 'old') {
        result.push(...hunk.removedLines);
      }
      // For 'committed' or 'draft', skip — output happens in the added branch
    } else if (change.added) {
      const hunk = hunks[hunkIdx];
      if (hunk?.choice === 'committed') {
        result.push(...hunk.addedLines);
      } else if (hunk?.choice === 'draft' && hunk.draftLines) {
        result.push(...hunk.draftLines);
      }
      // For 'old': skip — removedLines already pushed above
      hunkIdx++;
    }
  }

  // Remove trailing empty string
  if (result[result.length - 1] === '') result.pop();
  return result.join('\n');
}

// ─── DiffLine component (single colored line) ────────────────────────────────

function DiffLine({
  line,
  type,
  lineNumOld,
  lineNumNew,
}: {
  line: string;
  type: 'removed' | 'added' | 'draft' | 'context';
  lineNumOld?: number;
  lineNumNew?: number;
}) {
  const colors = useVSColors();

  const bg =
    type === 'removed' ? 'rgba(255, 80, 80, 0.18)'
    : type === 'added'   ? 'rgba(80, 200, 100, 0.18)'
    : type === 'draft'   ? 'rgba(234, 179, 8, 0.18)'   // amber — draft-only line
    : 'transparent';

  const prefix =
    type === 'removed' ? '−'
    : type === 'added'   ? '+'
    : type === 'draft'   ? '△'
    : ' ';

  const prefixColor =
    type === 'removed' ? '#fc8181'
    : type === 'added'   ? '#68d391'
    : type === 'draft'   ? '#f6e05e'   // yellow
    : colors.fgMuted;

  return (
    <Flex
      bg={bg}
      fontFamily="'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace"
      fontSize="12px"
      lineHeight="1.6"
      borderLeft={
        type === 'removed' ? '2px solid #fc8181'
        : type === 'added' ? '2px solid #68d391'
        : type === 'draft' ? '2px solid #f6e05e'
        : '2px solid transparent'
      }
    >
      {/* Line numbers */}
      <Box w="36px" textAlign="right" pr={1} color={colors.fgMuted} opacity={0.5} flexShrink={0} userSelect="none">
        {lineNumOld ?? ''}
      </Box>
      <Box w="36px" textAlign="right" pr={1} color={colors.fgMuted} opacity={0.5} flexShrink={0} userSelect="none">
        {lineNumNew ?? ''}
      </Box>
      {/* Prefix symbol */}
      <Box w="16px" color={prefixColor} flexShrink={0} userSelect="none" textAlign="center">
        {prefix}
      </Box>
      {/* Line content */}
      <Box
        flex={1}
        color={type === 'removed' ? '#fca5a5' : type === 'added' ? '#86efac' : colors.fg}
        whiteSpace="pre"
        overflow="hidden"
        textOverflow="ellipsis"
        px={1}
      >
        {line || '\u00A0' /* non-breaking space for empty lines */}
      </Box>
    </Flex>
  );
}

// ─── HunkBlock component (one diff hunk with 3-way keep/old/draft buttons) ──

function HunkBlock({
  hunk,
  oldLineStart,
  newLineStart,
  isDraftActive,
  onChoose,
}: {
  hunk: DiffHunk;
  oldLineStart: number;
  newLineStart: number;
  /** True when a draft is active in the editor */
  isDraftActive: boolean;
  onChoose: (id: number, choice: 'committed' | 'old' | 'draft') => void;
}) {
  const colors = useVSColors();

  const borderColor =
    hunk.choice === 'draft'     ? 'rgba(234,179,8,0.35)'
    : hunk.choice === 'committed' ? 'rgba(104,211,145,0.3)'
    : 'rgba(252,129,129,0.3)';

  const rowBg =
    hunk.choice === 'draft'     ? 'rgba(234,179,8,0.07)'
    : hunk.choice === 'committed' ? 'rgba(104,211,145,0.07)'
    : 'rgba(252,129,129,0.07)';

  return (
    <Box mb={1} borderRadius="4px" overflow="hidden" border={`1px solid ${borderColor}`}>
      {/* Context lines (before the hunk) */}
      {hunk.contextBefore.map((line, i) => (
        <DiffLine key={`ctx-${i}`} line={line} type="context" />
      ))}

      {/* Removed lines — always shown for comparison (red) */}
      {hunk.removedLines.map((line, i) => (
        <DiffLine key={`rem-${i}`} line={line} type="removed" lineNumOld={oldLineStart + i} />
      ))}

      {/* Committed lines — always shown (green) */}
      {hunk.addedLines.map((line, i) => (
        <DiffLine key={`add-${i}`} line={line} type="added" lineNumNew={newLineStart + i} />
      ))}

      {/* Draft lines — shown only when draft is active AND this hunk has draft changes (yellow) */}
      {isDraftActive && hunk.draftLines && hunk.draftLines.map((line, i) => (
        <DiffLine key={`dft-${i}`} line={line} type="draft" lineNumNew={newLineStart + i} />
      ))}

      {/* Action row — 3-way choice */}
      <Flex
        bg={rowBg}
        borderTop={`1px solid ${borderColor}`}
        px={3} py="6px"
        align="center"
        gap={2}
        flexWrap="wrap"
      >
        {/* Current choice badge */}
        <Badge
          fontSize="10px" px="6px" py="1px" borderRadius="3px"
          bg={
            hunk.choice === 'draft'     ? 'yellow.800'
            : hunk.choice === 'committed' ? 'green.800'
            : 'red.800'
          }
          color={
            hunk.choice === 'draft'     ? 'yellow.200'
            : hunk.choice === 'committed' ? 'green.200'
            : 'red.200'
          }
          textTransform="none"
        >
          {hunk.choice === 'draft'     ? '△ keeping draft'
           : hunk.choice === 'committed' ? '✓ keeping current'
           : '↩ using old'}
        </Badge>

        <Box flex={1} />

        {/* ── Keep current (green) ── */}
        <Tooltip label="Keep the committed version (green lines)" hasArrow openDelay={400} placement="top">
          <Button
            size="xs" h="22px" px={3}
            variant={hunk.choice === 'committed' ? 'solid' : 'outline'}
            colorScheme="green"
            fontSize="11px"
            onClick={() => onChoose(hunk.id, 'committed')}
            leftIcon={<Icon as={FiCheckCircle as ComponentType} boxSize="10px" />}
          >
            Keep current
          </Button>
        </Tooltip>

        {/* ── Use old (red) ── */}
        <Tooltip label="Revert to the old version (red lines)" hasArrow openDelay={400} placement="top">
          <Button
            size="xs" h="22px" px={3}
            variant={hunk.choice === 'old' ? 'solid' : 'outline'}
            colorScheme="red"
            fontSize="11px"
            onClick={() => onChoose(hunk.id, 'old')}
            leftIcon={<Icon as={FiRotateCcw as ComponentType} boxSize="10px" />}
          >
            Use old
          </Button>
        </Tooltip>

        {/* ── Keep draft (yellow) — only when this hunk has draft changes ── */}
        {isDraftActive && hunk.draftLines && (
          <Tooltip label="Keep your draft edits (yellow lines)" hasArrow openDelay={400} placement="top">
            <Button
              size="xs" h="22px" px={3}
              variant={hunk.choice === 'draft' ? 'solid' : 'outline'}
              colorScheme="yellow"
              fontSize="11px"
              onClick={() => onChoose(hunk.id, 'draft')}
              leftIcon={<Icon as={FiEdit2 as ComponentType} boxSize="10px" />}
            >
              Keep draft
            </Button>
          </Tooltip>
        )}
      </Flex>
    </Box>
  );
}

// ─── VersionDiffPanel ─────────────────────────────────────────────────────────

export interface VersionDiffPanelProps {
  jobId: number;
  isYaml: boolean;
  /** Version number currently open in the editor. Used to set the default
   *  "to" version so the diff always starts relative to what the user is
   *  looking at (e.g. v2 open → default v1→v2). */
  currentVersionNum?: number | null;
  /** In-browser draft content (not yet committed to DB). */
  draftContent?: string | null;
  onApply: (mergedText: string, fromVer: number, toVer: number) => void;
  onClose: () => void;
}

export default function VersionDiffPanel({
  jobId,
  isYaml,
  currentVersionNum,
  draftContent,
  onApply,
  onClose,
}: VersionDiffPanelProps) {
  const colors = useVSColors();

  // ── version lists ──────────────────────────────────────────────────────────
  const { data: yamlVersions, isLoading: yamlListLoading } = useYAMLVersions(jobId, true);
  const { data: codeVersions, isLoading: codeListLoading }  = useCodeVersions(jobId);

  const versionList = isYaml
    ? (yamlVersions ?? []).map(v => ({ num: v.version_number, label: `v${v.version_number}${v.is_approved ? ' ✓' : ''}` }))
    : (codeVersions ?? []).map(v => ({ num: v.version_number, label: `v${v.version_number}${v.is_accepted ? ' ✓' : ''}` }));

  const listLoading = isYaml ? yamlListLoading : codeListLoading;

  // Whether the draft overlays the "to" side
  const isDraftOverlay = draftContent != null;

  // Defaults: "to" = currently open version (or latest); "from" = one version earlier.
  // Sort ascending so index arithmetic is predictable regardless of API order.
  const sortedVersions = useMemo(
    () => [...versionList].sort((a, b) => (a.num ?? 0) - (b.num ?? 0)),
    [versionList],
  );
  const defaultTo = useMemo(() => {
    if (currentVersionNum != null && sortedVersions.some(v => v.num === currentVersionNum))
      return currentVersionNum;
    return sortedVersions[sortedVersions.length - 1]?.num ?? 1;
  }, [currentVersionNum, sortedVersions]);
  const defaultFrom = useMemo(() => {
    const idx = sortedVersions.findIndex(v => v.num === defaultTo);
    return idx > 0 ? sortedVersions[idx - 1].num : (sortedVersions[0]?.num ?? 1);
  }, [defaultTo, sortedVersions]);

  const [fromVer, setFromVer] = useState<number | null>(null);
  const [toVer,   setToVer]   = useState<number | null>(null);

  const resolvedFrom = fromVer ?? defaultFrom;
  const resolvedTo   = toVer   ?? defaultTo;

  // ── fetch content for selected versions ───────────────────────────────────
  const { data: fromData, isLoading: fromLoading } = useYAMLVersion(
    isYaml ? jobId : 0, isYaml ? (resolvedFrom ?? 1) : 0
  );
  const { data: toData, isLoading: toLoading } = useYAMLVersion(
    isYaml ? jobId : 0, isYaml ? (resolvedTo ?? 1) : 0
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: fromCodeData, isLoading: fromCodeLoading } = useCodeVersion(
    !isYaml ? jobId : 0, !isYaml ? (resolvedFrom ?? 1) : null
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: toCodeData, isLoading: toCodeLoading } = useCodeVersion(
    !isYaml ? jobId : 0, !isYaml ? (resolvedTo ?? 1) : null
  );

  const oldText   = isYaml ? (fromData?.yaml_content ?? '') : (fromCodeData?.code_content ?? '');
  const toDBText  = isYaml ? (toData?.yaml_content ?? '')   : (toCodeData?.code_content ?? '');
  // The main diff is ALWAYS fromVer → toDBText (committed changes).
  // Draft content is handled SEPARATELY via draftHunks correlation below.
  const newText   = toDBText;

  const contentLoading = isYaml
    ? (fromLoading || toLoading)
    : (fromCodeLoading || toCodeLoading);

  // ── compute committed diff hunks ─────────────────────────────────────────
  // Main diff: fromVer → toDBText (committed changes only, never draft)
  const rawChanges = useMemo(() => {
    if (!oldText && !newText) return [];
    return diffLines(oldText, newText);
  }, [oldText, newText]);

  const { hunks: computedHunks } = useMemo(
    () => buildHunks(rawChanges),
    [rawChanges],
  );

  // ── correlate draft hunks with committed hunks ────────────────────────────
  // Diff from toDBText (v2) to draftContent, NOT from oldText (v1) to draft.
  // This isolates only what the user changed on top of the committed version,
  // avoiding the line-shifting problem that caused spurious hunks whenever the
  // user inserted a new line (all subsequent positions shifted, breaking the
  // oldLineStart match against computedHunks which were built from v1).
  const draftVsToChanges = useMemo(() => {
    if (!isDraftOverlay || !draftContent || contentLoading) return [];
    return diffLines(toDBText, draftContent);
  }, [isDraftOverlay, draftContent, toDBText, contentLoading]);

  const { hunks: draftVsToHunks } = useMemo(
    () => (draftVsToChanges.length > 0 ? buildHunks(draftVsToChanges) : { hunks: [] }),
    [draftVsToChanges],
  );

  // Build the display-hunk list:
  //   1. Start with all committed hunks (v1→v2) as the base.
  //   2. For each hunk in draftVsToHunks whose oldLineStart falls inside a
  //      committed hunk’s v2 added-line range → attach draftLines to that hunk.
  //   3. For draftVsToHunks with no committed overlap → pure new draft insertion;
  //      append as a draft-only hunk (addedLines=[], draftLines=theChange).
  const computedHunksWithDraft = useMemo<DiffHunk[]>(() => {
    if (!isDraftOverlay || draftVsToHunks.length === 0) return computedHunks;

    // Build a lookup: every line number that belongs to a committed hunk’s
    // v2 added block -> that committed hunk.
    const v2LineToHunk = new Map<number, DiffHunk>();
    for (const ch of computedHunks) {
      const len = Math.max(ch.addedLines.length, 1); // always cover at least 1 line
      for (let i = 0; i < len; i++) {
        v2LineToHunk.set(ch.newLineStart + i, ch);
      }
    }

    const enriched = new Map<number, DiffHunk>(computedHunks.map(h => [h.id, h]));
    const draftOnlyHunks: DiffHunk[] = [];
    const nextId = (computedHunks.length > 0 ? Math.max(...computedHunks.map(h => h.id)) : 0) + 1;
    let idCounter = nextId;

    for (const dvt of draftVsToHunks) {
      const overlapping = v2LineToHunk.get(dvt.oldLineStart);
      if (overlapping && !enriched.get(overlapping.id)?.draftLines) {
        // User edited lines within a committed-change region
        const dl = dvt.addedLines.length > 0 ? dvt.addedLines : null;
        enriched.set(overlapping.id, {
          ...overlapping,
          draftLines: dl,
          choice: (dl ? 'draft' : 'committed') as DiffHunk['choice'],
        });
      } else if (!overlapping) {
        // Pure new draft change in an area where v1 and v2 agree
        draftOnlyHunks.push({
          id: idCounter++,
          removedLines: dvt.removedLines,
          addedLines: [],    // nothing was committed here (v1 = v2 at this position)
          draftLines: dvt.addedLines.length > 0 ? dvt.addedLines : null,
          contextBefore: dvt.contextBefore,
          oldLineStart: dvt.oldLineStart,
          newLineStart: dvt.newLineStart,
          choice: 'draft',
        });
      }
    }

    const base = computedHunks.map(h => enriched.get(h.id) ?? h);
    draftOnlyHunks.sort((a, b) => a.newLineStart - b.newLineStart);
    return [...base, ...draftOnlyHunks];
  }, [computedHunks, draftVsToHunks, isDraftOverlay]);

  // ── sync local hunks when version selection or content changes ────────────
  // Guard on !contentLoading so we never sync from an empty oldText.
  const [localHunks, setLocalHunks] = useState<DiffHunk[]>([]);
  const [lastChangeKey, setLastChangeKey] = useState('');

  const changeKey = `${resolvedFrom}→${resolvedTo}:${isDraftOverlay ? 'draft' : 'db'}:${computedHunksWithDraft.length}`;
  if (!contentLoading && changeKey !== lastChangeKey) {
    setLocalHunks(computedHunksWithDraft.map(h => ({ ...h })));
    setLastChangeKey(changeKey);
  }

  // When draft correlated hunks change (e.g. user keeps typing), update
  // existing localHunks' draftLines without resetting the user's choices.
  const draftKey = useMemo(
    () => computedHunksWithDraft.map(h => `${h.id}:${JSON.stringify(h.draftLines)}`).join('|'),
    [computedHunksWithDraft],
  );
  const prevDraftKeyRef = useRef('');
  useEffect(() => {
    if (draftKey === prevDraftKeyRef.current) return;
    prevDraftKeyRef.current = draftKey;
    setLocalHunks(prev => {
      // First render after a draft appears — initialize from scratch
      if (prev.length === 0) return computedHunksWithDraft.map(h => ({ ...h }));
      // Rebuild array to match computedHunksWithDraft (captures new / removed hunks),
      // preserving the user's per-hunk choices based on stable id (oldLineStart)
      return computedHunksWithDraft.map(updated => {
        const existing = prev.find(lh => lh.id === updated.id);
        if (!existing) return { ...updated };  // brand-new hunk (e.g. user typed a new line)
        const choice: DiffHunk['choice'] =
          existing.choice === 'draft' && !updated.draftLines ? 'committed' : existing.choice;
        return { ...existing, addedLines: updated.addedLines, draftLines: updated.draftLines, choice };
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  const chooseHunk = (id: number, choice: 'committed' | 'old' | 'draft') => {
    setLocalHunks(prev => prev.map(h => h.id === id ? { ...h, choice } : h));
  };

  // Use localHunks directly for both display and apply (choice carries all state)
  const displayHunks = localHunks;

  // ── compute preview stats ─────────────────────────────────────────────────
  const keptFromDraft     = displayHunks.filter(h => h.choice === 'draft').length;
  const keptFromCurrent   = displayHunks.filter(h => h.choice === 'committed').length;
  const undoneCount       = displayHunks.filter(h => h.choice === 'old').length;

  // ── apply handler ─────────────────────────────────────────────────────────
  const handleApply = () => {
    // Walk rawChanges (v1→v2) and apply per-hunk choices.
    // 'committed' → v2 lines, 'old' → v1 lines, 'draft' → draftLines.
    // Draft-only hunks (pure new insertions) are not in rawChanges and will be
    // included by passing draftContent as the base when no committed choice was made.
    const merged = buildMergedText(oldText, rawChanges, displayHunks);
    onApply(merged, resolvedFrom ?? 0, resolvedTo ?? 0);
    onClose();
  };

  // ── render ────────────────────────────────────────────────────────────────
  const isLoading = listLoading || contentLoading;

  return (
    <Flex direction="column" h="100%" overflow="hidden" bg={colors.editor}>
      {/* Header */}
      <Flex
        align="center"
        px={3}
        h="36px"
        bg={colors.tabBar}
        borderBottom={`1px solid ${colors.panelBorder}`}
        gap={2}
        flexShrink={0}
      >
        <Text fontSize="12px" fontWeight="semibold" color={colors.fgActive} mr={1}>
          Version Diff
        </Text>

        {/* From version selector */}
        <Text fontSize="11px" color={colors.fgMuted}>from</Text>
        <Select
          size="xs"
          value={resolvedFrom ?? undefined}
          onChange={e => setFromVer(Number(e.target.value))}
          w="80px"
          bg={colors.input}
          borderColor={colors.inputBorder}
          color={colors.fg}
          fontSize="11px"
          isDisabled={listLoading}
        >
          {sortedVersions.map(v => (
            <option key={v.num} value={v.num ?? undefined}>{v.label}</option>
          ))}
        </Select>

        <Text fontSize="11px" color={colors.fgMuted}>→</Text>

        {/* To version selector — draft overlays this if a draft is present */}
        <Select
          size="xs"
          value={resolvedTo ?? undefined}
          onChange={e => setToVer(Number(e.target.value))}
          w="80px"
          bg={isDraftOverlay ? 'rgba(234,179,8,0.12)' : colors.input}
          borderColor={isDraftOverlay ? 'rgba(234,179,8,0.4)' : colors.inputBorder}
          color={colors.fg}
          fontSize="11px"
          isDisabled={listLoading}
        >
          {sortedVersions.map(v => (
            <option key={v.num} value={v.num ?? undefined}>{v.label}</option>
          ))}
        </Select>
        {/* Draft overlay indicator */}
        {isDraftOverlay && (
          <Tooltip
            label="Your unsaved draft is overlaid on this version. Yellow lines (△) are draft-only changes; green lines (+) are committed changes from this version."
            hasArrow
            placement="bottom"
            openDelay={200}
          >
            <Badge
              fontSize="10px"
              px="6px" py="1px"
              borderRadius="3px"
              bg="rgba(234,179,8,0.2)"
              color="yellow.300"
              cursor="default"
              whiteSpace="nowrap"
            >
              + draft overlay
            </Badge>
          </Tooltip>
        )}

        <Box flex={1} />

        {/* Stats */}
        {localHunks.length > 0 && (
          <HStack spacing={1}>
            {isDraftOverlay && (
              <Badge fontSize="10px" px="6px" py="1px" bg="yellow.800" color="yellow.200" borderRadius="3px">
                {keptFromDraft} kept from draft
              </Badge>
            )}
            <Badge fontSize="10px" px="6px" py="1px" bg="green.800" color="green.200" borderRadius="3px">
              {keptFromCurrent} kept from current
            </Badge>
            <Badge fontSize="10px" px="6px" py="1px" bg="red.800" color="red.200" borderRadius="3px">
              {undoneCount} undone
            </Badge>
          </HStack>
        )}

        {/* Apply button */}
        {localHunks.length > 0 && (
          <Tooltip label="Apply merged result to editor" hasArrow placement="bottom" openDelay={300}>
            <Button
              size="xs"
              colorScheme="teal"
              fontSize="11px"
              h="22px"
              leftIcon={<Icon as={FiCheck as ComponentType} boxSize="10px" />}
              onClick={handleApply}
            >
              Apply
            </Button>
          </Tooltip>
        )}

        {/* Close */}
        <Tooltip label="Close diff" hasArrow placement="bottom">
          <IconButton
            aria-label="Close version diff"
            icon={<Icon as={FiX as ComponentType} boxSize="10px" />}
            size="xs"
            variant="ghost"
            color={colors.fgMuted}
            _hover={{ color: colors.fgActive, bg: colors.hover }}
            minW="22px" h="22px"
            onClick={onClose}
          />
        </Tooltip>
      </Flex>

      {/* Colour legend — always visible */}
      <Flex
        px={3} py="4px" gap={4}
        bg="rgba(0,0,0,0.2)"
        borderBottom={`1px solid ${colors.panelBorder}`}
        flexShrink={0}
        align="center"
        flexWrap="wrap"
      >
        <Text fontSize="10px" color={colors.fgMuted} fontStyle="italic" mr={1}>Legend:</Text>
        <HStack spacing={1}>
          <Box w="8px" h="8px" borderRadius="2px" bg="rgba(255,80,80,0.5)" border="1px solid #fc8181" />
          <Text fontSize="10px" color="#fc8181">− removed from v{resolvedFrom}</Text>
        </HStack>
        <HStack spacing={1}>
          <Box w="8px" h="8px" borderRadius="2px" bg="rgba(80,200,100,0.5)" border="1px solid #68d391" />
          <Text fontSize="10px" color="#68d391">+ in v{resolvedTo} (committed)</Text>
        </HStack>
        {isDraftOverlay && (
          <HStack spacing={1}>
            <Box w="8px" h="8px" borderRadius="2px" bg="rgba(234,179,8,0.5)" border="1px solid #f6e05e" />
            <Text fontSize="10px" color="#f6e05e">△ your draft edits (not committed)</Text>
          </HStack>
        )}
      </Flex>

      {/* Diff content */}
      <Box flex={1} overflow="auto" px={2} py={2}>
        {isLoading && (
          <Flex align="center" justify="center" h="100px" gap={2}>
            <Spinner size="sm" color={colors.fgMuted} />
            <Text fontSize="12px" color={colors.fgMuted}>Loading versions…</Text>
          </Flex>
        )}

        {!isLoading && localHunks.length === 0 && oldText && newText && (
          <Flex align="center" justify="center" h="80px">
            <Text fontSize="12px" color={colors.fgMuted}>
              No differences between v{resolvedFrom} and {isDraftOverlay ? `v${resolvedTo} + draft` : `v${resolvedTo}`}.
            </Text>
          </Flex>
        )}

        {!isLoading && localHunks.length === 0 && (!oldText || !newText) && (
          <Flex align="center" justify="center" h="80px">
            <Text fontSize="12px" color={colors.fgMuted}>
              Select two versions to compare.
            </Text>
          </Flex>
        )}

        {!isLoading && displayHunks.map((hunk) => (
          <HunkBlock
            key={hunk.id}
            hunk={hunk}
            oldLineStart={hunk.oldLineStart}
            newLineStart={hunk.newLineStart}
            isDraftActive={isDraftOverlay}
            onChoose={chooseHunk}
          />
        ))}
      </Box>
    </Flex>
  );
}
