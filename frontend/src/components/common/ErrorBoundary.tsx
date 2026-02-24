import React from 'react';
import {
  Box,
  Button,
  Container,
  Heading,
  Icon,
  Text,
  VStack,
  Code,
  Collapse,
  useColorModeValue,
} from '@chakra-ui/react';
import { FiAlertTriangle, FiRefreshCw, FiChevronDown } from 'react-icons/fi';

// ─── Error Display (functional, safe to call from within class) ───────────────

function ErrorDisplay({
  error,
  resetError,
}: {
  error: Error;
  resetError: () => void;
}) {
  const [showDetails, setShowDetails] = React.useState(false);
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('red.200', 'red.700');

  return (
    <Container maxW="lg" py={20}>
      <VStack
        spacing={6}
        bg={bg}
        border="1px solid"
        borderColor={borderColor}
        borderRadius="2xl"
        p={10}
        align="center"
        textAlign="center"
      >
        <Box
          bg="red.900"
          borderRadius="full"
          p={4}
          display="inline-flex"
        >
          <Icon as={FiAlertTriangle} boxSize={8} color="red.300" />
        </Box>

        <VStack spacing={2}>
          <Heading size="md" color="red.400">
            Something went wrong
          </Heading>
          <Text fontSize="sm" color="gray.400" maxW="400px">
            An unexpected error occurred. You can try refreshing the page or
            returning to the previous view.
          </Text>
        </VStack>

        <VStack spacing={3} w="full">
          <Button
            leftIcon={<FiRefreshCw />}
            colorScheme="brand"
            w="full"
            onClick={resetError}
          >
            Try Again
          </Button>
          <Button
            variant="ghost"
            w="full"
            onClick={() => (window.location.href = '/')}
          >
            Go to Dashboard
          </Button>
        </VStack>

        <Box w="full">
          <Button
            variant="ghost"
            size="xs"
            color="gray.500"
            rightIcon={<FiChevronDown />}
            onClick={() => setShowDetails((v) => !v)}
          >
            {showDetails ? 'Hide' : 'Show'} error details
          </Button>
          <Collapse in={showDetails} animateOpacity>
            <Code
              display="block"
              whiteSpace="pre-wrap"
              fontSize="xs"
              p={3}
              mt={2}
              borderRadius="md"
              w="full"
              overflowX="auto"
              colorScheme="red"
            >
              {error.name}: {error.message}
              {error.stack ? `\n\n${error.stack}` : ''}
            </Code>
          </Collapse>
        </Box>
      </VStack>
    </Container>
  );
}

// ─── Error Boundary (class component required by React) ───────────────────────

interface Props {
  children: React.ReactNode;
  /** Optional fallback to render instead of the default error UI */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Could wire a logging service here (e.g. Sentry)
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return (
        <ErrorDisplay error={this.state.error} resetError={this.reset} />
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
