/**
 * MarkdownRenderer
 *
 * Renders Markdown text as formatted HTML using react-markdown.
 * Styled to match the Word document export: bold headings, sized text,
 * proper lists, and code blocks with background shading.
 */

import { Box } from '@chakra-ui/react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
  /** Optional: apply VS Code dark theme styling */
  variant?: 'default' | 'vscode';
}

const defaultStyles: Components = {
  h1: ({ children }) => (
    <Box as="h1" fontSize="xl" fontWeight="bold" color="blue.700" mt={5} mb={2} pb={1} borderBottom="2px solid" borderColor="blue.600">
      {children}
    </Box>
  ),
  h2: ({ children }) => (
    <Box as="h2" fontSize="lg" fontWeight="bold" color="blue.600" mt={4} mb={1.5}>
      {children}
    </Box>
  ),
  h3: ({ children }) => (
    <Box as="h3" fontSize="md" fontWeight="bold" color="blue.500" mt={3} mb={1}>
      {children}
    </Box>
  ),
  h4: ({ children }) => (
    <Box as="h4" fontSize="sm" fontWeight="bold" mt={2} mb={1}>
      {children}
    </Box>
  ),
  p: ({ children }) => (
    <Box as="p" fontSize="sm" lineHeight={1.8} mb={2}>
      {children}
    </Box>
  ),
  ul: ({ children }) => (
    <Box as="ul" pl={5} mb={2} fontSize="sm" lineHeight={1.8} listStyleType="disc">
      {children}
    </Box>
  ),
  ol: ({ children }) => (
    <Box as="ol" pl={5} mb={2} fontSize="sm" lineHeight={1.8} listStyleType="decimal">
      {children}
    </Box>
  ),
  li: ({ children }) => (
    <Box as="li" mb={0.5}>
      {children}
    </Box>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <Box
          as="pre"
          bg="gray.100"
          _dark={{ bg: 'gray.800' }}
          borderRadius="md"
          p={3}
          my={2}
          fontSize="xs"
          fontFamily="mono"
          overflowX="auto"
          whiteSpace="pre-wrap"
          lineHeight={1.6}
        >
          <code>{children}</code>
        </Box>
      );
    }
    return (
      <Box
        as="code"
        bg="gray.100"
        _dark={{ bg: 'gray.700' }}
        px={1}
        py={0.5}
        borderRadius="sm"
        fontSize="xs"
        fontFamily="mono"
      >
        {children}
      </Box>
    );
  },
  pre: ({ children }) => <>{children}</>,
  strong: ({ children }) => (
    <Box as="strong" fontWeight="bold">
      {children}
    </Box>
  ),
  em: ({ children }) => (
    <Box as="em" fontStyle="italic">
      {children}
    </Box>
  ),
  hr: () => (
    <Box as="hr" my={4} borderColor="gray.300" _dark={{ borderColor: 'gray.600' }} />
  ),
  blockquote: ({ children }) => (
    <Box
      pl={4}
      borderLeft="3px solid"
      borderColor="gray.300"
      color="gray.600"
      _dark={{ borderColor: 'gray.600', color: 'gray.400' }}
      my={2}
      fontStyle="italic"
    >
      {children}
    </Box>
  ),
};

const vscodeStyles: Components = {
  h1: ({ children }) => (
    <Box as="h1" fontSize="18px" fontWeight="bold" color="#7cc4f5" mt={5} mb={2} pb={1} borderBottom="1px solid rgba(124,196,245,0.25)">
      {children}
    </Box>
  ),
  h2: ({ children }) => (
    <Box as="h2" fontSize="15px" fontWeight="bold" color="#8ab4f8" mt={4} mb={1.5}>
      {children}
    </Box>
  ),
  h3: ({ children }) => (
    <Box as="h3" fontSize="13px" fontWeight="bold" color="#9ec5fe" mt={3} mb={1}>
      {children}
    </Box>
  ),
  h4: ({ children }) => (
    <Box as="h4" fontSize="12px" fontWeight="bold" color="#b0d0ff" mt={2} mb={1}>
      {children}
    </Box>
  ),
  p: ({ children }) => (
    <Box as="p" fontSize="13px" lineHeight={1.8} mb={2} color="#d4d4d4">
      {children}
    </Box>
  ),
  ul: ({ children }) => (
    <Box as="ul" pl={5} mb={2} fontSize="13px" lineHeight={1.8} color="#d4d4d4" listStyleType="disc">
      {children}
    </Box>
  ),
  ol: ({ children }) => (
    <Box as="ol" pl={5} mb={2} fontSize="13px" lineHeight={1.8} color="#d4d4d4" listStyleType="decimal">
      {children}
    </Box>
  ),
  li: ({ children }) => (
    <Box as="li" mb={0.5}>
      {children}
    </Box>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <Box
          as="pre"
          bg="rgba(255,255,255,0.05)"
          borderRadius="4px"
          p={3}
          my={2}
          fontSize="12px"
          fontFamily="'JetBrains Mono', 'Fira Code', monospace"
          overflowX="auto"
          whiteSpace="pre-wrap"
          lineHeight={1.6}
          color="#c5c8c6"
        >
          <code>{children}</code>
        </Box>
      );
    }
    return (
      <Box
        as="code"
        bg="rgba(255,255,255,0.08)"
        px="4px"
        py="1px"
        borderRadius="3px"
        fontSize="12px"
        fontFamily="'JetBrains Mono', 'Fira Code', monospace"
        color="#e2b86b"
      >
        {children}
      </Box>
    );
  },
  pre: ({ children }) => <>{children}</>,
  strong: ({ children }) => (
    <Box as="strong" fontWeight="bold" color="#e8e8e8">
      {children}
    </Box>
  ),
  em: ({ children }) => (
    <Box as="em" fontStyle="italic" color="#b8b8b8">
      {children}
    </Box>
  ),
  hr: () => (
    <Box as="hr" my={4} borderColor="rgba(255,255,255,0.1)" />
  ),
  blockquote: ({ children }) => (
    <Box
      pl={4}
      borderLeft="3px solid rgba(168,85,246,0.4)"
      color="#999"
      my={2}
      fontStyle="italic"
    >
      {children}
    </Box>
  ),
};

export default function MarkdownRenderer({ content, variant = 'default' }: MarkdownRendererProps) {
  const components = variant === 'vscode' ? vscodeStyles : defaultStyles;

  return (
    <Box>
      <ReactMarkdown components={components}>
        {content}
      </ReactMarkdown>
    </Box>
  );
}
