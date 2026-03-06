/**
 * GenerationProcessingOverlay
 *
 * Full-panel overlay shown whenever YAML or Code generation is in progress.
 * The parent element must have `position: relative` (or `position: absolute`)
 * so this overlay can stretch to cover it via `inset: 0`.
 *
 * Props
 * ─────
 * type     – 'yaml' (Job 1) or 'code' (Job 2)
 * language – target language label shown in the title for code generation
 */

import { Box, Flex, VStack, Text, Icon, HStack } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import type { ComponentType } from 'react';
import { useState, useEffect } from 'react';
import { FiZap, FiCode, FiClock } from 'react-icons/fi';

// ─── Keyframe animations ──────────────────────────────────────────────────────

const pulseRing = keyframes`
  0%   { transform: scale(0.4); opacity: 0.8; }
  75%  { transform: scale(2.5); opacity: 0;   }
  100% { transform: scale(0.4); opacity: 0;   }
`;

const breathe = keyframes`
  0%   { transform: scale(1);    }
  50%  { transform: scale(1.10); }
  100% { transform: scale(1);    }
`;

const slideBar = keyframes`
  0%   { transform: translateX(-130%); }
  100% { transform: translateX(420%);  }
`;

// ─── Animated three-dot suffix ────────────────────────────────────────────────

function AnimatedDots() {
  const [dots, setDots] = useState('');
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      n = (n + 1) % 4;
      setDots('.'.repeat(n));
    }, 450);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{ minWidth: '18px', display: 'inline-block' }}>{dots}</span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface GenerationProcessingOverlayProps {
  type: 'yaml' | 'code';
  /** Human-readable language name, e.g. "Python", "TypeScript". Used in title. */
  language?: string | null;
}

export default function GenerationProcessingOverlay({
  type,
  language,
}: GenerationProcessingOverlayProps) {
  const [elapsed, setElapsed] = useState(0);

  // Reset and start elapsed timer each time the overlay mounts
  useEffect(() => {
    setElapsed(0);
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const isYaml    = type === 'yaml';
  const accent    = isYaml ? '#60a5fa' : '#a78bfa';
  const ringRgba  = isYaml ? 'rgba(96,165,250,' : 'rgba(167,139,250,';
  const iconBg    = isYaml ? 'rgba(96,165,250,0.08)' : 'rgba(167,139,250,0.08)';
  const iconBorder = isYaml ? 'rgba(96,165,250,0.28)' : 'rgba(167,139,250,0.28)';

  const title    = isYaml ? 'Generating YAML' : `Generating ${language ?? 'Target Code'}`;
  const subtitle = isYaml
    ? 'The LLM is analyzing your Pick Basic source code'
    : 'The LLM is translating the approved YAML into target code';

  return (
    <Box
      position="absolute"
      inset={0}
      zIndex={100}
      bg="rgba(10, 12, 23, 0.92)"
      backdropFilter="blur(5px)"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      userSelect="none"
      // Capture pointer events so clicks pass through are blocked while generating
      pointerEvents="all"
      borderRadius="inherit"
    >
      {/* ── Three expanding rings + central icon ── */}
      <Box position="relative" w="112px" h="112px" mb={7} flexShrink={0}>
        {/* Ring 1 */}
        <Box
          position="absolute" inset={0} borderRadius="full"
          border={`2px solid ${ringRgba}0.5)`}
          animation={`${pulseRing} 2.5s ease-out 0s infinite`}
        />
        {/* Ring 2 */}
        <Box
          position="absolute" inset={0} borderRadius="full"
          border={`2px solid ${ringRgba}0.4)`}
          animation={`${pulseRing} 2.5s ease-out 0.83s infinite`}
        />
        {/* Ring 3 */}
        <Box
          position="absolute" inset={0} borderRadius="full"
          border={`2px solid ${ringRgba}0.3)`}
          animation={`${pulseRing} 2.5s ease-out 1.66s infinite`}
        />
        {/* Icon */}
        <Flex position="absolute" inset={0} align="center" justify="center">
          <Flex
            w="66px" h="66px"
            borderRadius="full"
            bg={iconBg}
            border={`1.5px solid ${iconBorder}`}
            align="center" justify="center"
            animation={`${breathe} 2.2s ease-in-out infinite`}
          >
            <Icon
              as={(isYaml ? FiZap : FiCode) as ComponentType}
              boxSize="28px"
              color={accent}
            />
          </Flex>
        </Flex>
      </Box>

      {/* ── Labels ── */}
      <VStack spacing={1.5} align="center">
        <Text
          fontSize="17px"
          fontWeight="600"
          color="white"
          letterSpacing="0.02em"
          lineHeight={1}
        >
          {title}<AnimatedDots />
        </Text>

        <Text
          fontSize="12px"
          color="rgba(255,255,255,0.38)"
          textAlign="center"
          maxW="270px"
          lineHeight={1.6}
        >
          {subtitle}
        </Text>

        <Box h="4px" />

        <HStack spacing={1.5}>
          <Icon
            as={FiClock as ComponentType}
            boxSize="11px"
            color="rgba(255,255,255,0.22)"
          />
          <Text fontSize="11px" color="rgba(255,255,255,0.22)">
            {elapsed}s elapsed · please do not click again
          </Text>
        </HStack>

        <Text fontSize="10px" color="rgba(255,255,255,0.14)" mt={1}>
          This may take 30 – 90 seconds depending on code complexity
        </Text>
      </VStack>

      {/* ── Indeterminate progress bar at bottom ── */}
      <Box
        position="absolute" bottom={0} left={0} right={0}
        h="3px"
        bg="rgba(255,255,255,0.05)"
        overflow="hidden"
        borderBottomRadius="inherit"
      >
        <Box
          h="full"
          w="35%"
          bg={`linear-gradient(90deg, transparent, ${accent}, transparent)`}
          animation={`${slideBar} 1.8s linear infinite`}
        />
      </Box>
    </Box>
  );
}
