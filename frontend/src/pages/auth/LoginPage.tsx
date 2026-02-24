import { useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Input,
  InputGroup,
  InputRightElement,
  VStack,
  Heading,
  Text,
  Card,
  CardBody,
  Divider,
  Alert,
  AlertIcon,
  useColorModeValue,
  IconButton,
} from '@chakra-ui/react';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { authApi } from '../../services/authApi';
import { useAuthStore } from '../../store/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ username: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const cardBg = useColorModeValue('white', 'gray.800');

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      login(data.access_token, data.user);
      toast.success(`Welcome back, ${data.user.username}!`);
      navigate('/');
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      const msg = err.response?.data?.detail || 'Login failed. Check your credentials.';
      toast.error(msg);
    },
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.username.trim()) e.username = 'Username is required';
    if (!form.password) e.password = 'Password is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) loginMutation.mutate(form);
  };

  return (
    <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" p={4}>
      <Box w="full" maxW="420px">
        {/* Header */}
        <VStack spacing={2} mb={8} textAlign="center">
          <Text fontSize="4xl">🔄</Text>
          <Heading size="xl">Legacy Migration</Heading>
          <Text color="gray.500" fontSize="sm">
            Sign in to your account
          </Text>
        </VStack>

        <Card bg={cardBg} borderRadius="2xl" boxShadow="lg">
          <CardBody p={8}>
            {loginMutation.isError && (
              <Alert status="error" mb={4} borderRadius="lg">
                <AlertIcon />
                {(loginMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                  'Login failed'}
              </Alert>
            )}

            <form onSubmit={handleSubmit}>
              <VStack spacing={5}>
                <FormControl isInvalid={!!errors.username}>
                  <FormLabel fontWeight="medium">Username</FormLabel>
                  <Input
                    placeholder="Enter your username"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    size="lg"
                    borderRadius="lg"
                    autoComplete="username"
                    autoFocus
                  />
                  <FormErrorMessage>{errors.username}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={!!errors.password}>
                  <FormLabel fontWeight="medium">Password</FormLabel>
                  <InputGroup size="lg">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      borderRadius="lg"
                      autoComplete="current-password"
                    />
                    <InputRightElement>
                      <IconButton
                        aria-label="Toggle password"
                        icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowPassword(!showPassword)}
                      />
                    </InputRightElement>
                  </InputGroup>
                  <FormErrorMessage>{errors.password}</FormErrorMessage>
                </FormControl>

                <Button
                  type="submit"
                  colorScheme="blue"
                  size="lg"
                  w="full"
                  borderRadius="lg"
                  isLoading={loginMutation.isPending}
                  loadingText="Signing in..."
                  mt={2}
                >
                  Sign In
                </Button>
              </VStack>
            </form>

            <Divider my={6} />

            <Text textAlign="center" fontSize="sm" color="gray.500">
              Don't have an account?{' '}
              <Text as={Link} to="/register" color="blue.400" fontWeight="medium" _hover={{ textDecoration: 'underline' }}>
                Create one
              </Text>
            </Text>
          </CardBody>
        </Card>
      </Box>
    </Box>
  );
}
