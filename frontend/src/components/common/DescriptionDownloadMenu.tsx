/**
 * DescriptionDownloadMenu
 *
 * Self-contained button group that lives in the YamlVersionsPanel action bar.
 *
 * Behaviour:
 *  - If no description is cached yet → shows a "Generate Description" button.
 *  - If a description exists         → shows a "Download Description ▾" split-menu
 *    with "Word (.docx)" and "PDF (.pdf)" options, plus a muted
 *    "Regenerate" icon-button to refresh the cached text.
 *  - All loading states are handled inline; no external state needed.
 */

import {
  Button,
  HStack,
  Icon,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
  Tooltip,
  useColorModeValue,
} from '@chakra-ui/react';
import { FiChevronDown, FiDownload, FiFileText, FiRefreshCw, FiZap } from 'react-icons/fi';

import {
  useYamlDescription,
  useGenerateDescription,
  useDownloadDescription,
} from '../../hooks/useYaml';
import type { DescriptionFormat } from '../../types';

// ─────────────────────────────────────────────────────────────────────────────

interface DescriptionDownloadMenuProps {
  jobId: number;
  sourceFilename?: string | null;
}

export default function DescriptionDownloadMenu({ jobId, sourceFilename }: DescriptionDownloadMenuProps) {
  const { data: description, isLoading: checkLoading } = useYamlDescription(jobId);
  const generate = useGenerateDescription(jobId);
  const download = useDownloadDescription(jobId, sourceFilename);

  const menuBg = useColorModeValue('white', 'gray.800');
  const menuBorder = useColorModeValue('gray.200', 'gray.600');

  // While we're still checking whether a description exists, render nothing so
  // we don't flash the "Generate" button and then immediately swap to "Download".
  if (checkLoading) return null;

  const hasDescription = !!description;

  // ── No description yet ────────────────────────────────────────────────────
  if (!hasDescription) {
    return (
      <Button
        leftIcon={<FiFileText />}
        colorScheme="purple"
        size="sm"
        variant="outline"
        isLoading={generate.isPending}
        loadingText="Generating…"
        onClick={() => generate.mutate(false)}
      >
        Generate Description
      </Button>
    );
  }

  // ── Description exists — show download menu + regenerate button ───────────
  const handleDownload = (fmt: DescriptionFormat) => {
    download.mutate(fmt);
  };

  return (
    <HStack spacing={1}>
      <Menu>
        <MenuButton
          as={Button}
          leftIcon={<FiDownload />}
          rightIcon={<FiChevronDown />}
          colorScheme="purple"
          size="sm"
          isLoading={download.isPending}
          loadingText="Downloading…"
        >
          Download Description
        </MenuButton>
        <MenuList
          bg={menuBg}
          borderColor={menuBorder}
          fontSize="sm"
          minW="200px"
          zIndex={10}
        >
          <MenuItem
            icon={<Icon as={FiFileText} />}
            onClick={() => handleDownload('docx')}
          >
            <Text>Word Document (.docx)</Text>
          </MenuItem>
          <MenuItem
            icon={<Icon as={FiDownload} />}
            onClick={() => handleDownload('pdf')}
          >
            <Text>PDF File (.pdf)</Text>
          </MenuItem>
          <MenuItem
            icon={<Icon as={FiFileText} />}
            onClick={() => handleDownload('md')}
          >
            <Text>Markdown (.md)</Text>
          </MenuItem>
        </MenuList>
      </Menu>

      <Tooltip label="Regenerate description" hasArrow>
        <IconButton
          aria-label="Regenerate description"
          icon={<FiRefreshCw />}
          size="sm"
          variant="ghost"
          colorScheme="purple"
          isLoading={generate.isPending}
          onClick={() => generate.mutate(true)}
        />
      </Tooltip>
    </HStack>
  );
}
