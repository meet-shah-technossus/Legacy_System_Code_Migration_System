import { useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  FormErrorMessage,
  FormHelperText,
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

export default function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const cardBg = useColorModeValue('white', 'gray.800');

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: (data) => {
      login(data.access_token, data.user);
      toast.success('Account created! Welcome.');
      navigate('/');
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      const msg = err.response?.data?.detail || 'Registration failed.';
      toast.error(msg);
    },
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.username.trim()) e.username = 'Username is required';
    else if (form.username.length < 3) e.username = 'Username must be at least 3 characters';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email';
    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 6) e.password = 'Password must be at least 6 characters';
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      const { confirmPassword, ...data } = form;
      void confirmPassword;
      registerMutation.mutate(data);
    }
  };

  return (
    <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" p={4}>
      <Box w="full" maxW="460px">
        {/* Header */}
        <VStack spacing={2} mb={8} textAlign="center">
          <Text fontSize="4xl">🔄</Text>
          <Heading size="xl">Create Account</Heading>
          <Text color="gray.500" fontSize="sm">
            Join the Legacy Migration System
          </Text>
        </VStack>

        <Card bg={cardBg} borderRadius="2xl" boxShadow="lg">
          <CardBody p={8}>
            {registerMutation.isError && (
              <Alert status="error" mb={4} borderRadius="lg">
                <AlertIcon />
                {(registerMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                  'Registration failed'}
              </Alert>
            )}

            <form onSubmit={handleSubmit}>
              <VStack spacing={5}>
                <FormControl isInvalid={!!errors.username}>
                  <FormLabel fontWeight="medium">Username</FormLabel>
                  <Input
                    placeholder="e.g. john_dev"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    size="lg"
                    borderRadius="lg"
                    autoFocus
                  />
                  <FormErrorMessage>{errors.username}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={!!errors.email}>
                  <FormLabel fontWeight="medium">Email</FormLabel>
                  <Input
                    type="email"
                    placeholder="you@company.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    size="lg"
                    borderRadius="lg"
                  />
                  <FormErrorMessage>{errors.email}</FormErrorMessage>
                </FormControl>

                <FormControl>
                  <FormLabel fontWeight="medium">
                    Full Name{' '}
                    <Text as="span" color="gray.400" fontSize="sm">
                      (optional)
                    </Text>
                  </FormLabel>
                  <Input
                    placeholder="John Doe"
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    size="lg"
                    borderRadius="lg"
                  />
                </FormControl>

                <FormControl isInvalid={!!errors.password}>
                  <FormLabel fontWeight="medium">Password</FormLabel>
                  <InputGroup size="lg">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Minimum 6 characters"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      borderRadius="lg"
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
                  <FormHelperText>At least 6 characters</FormHelperText>
                </FormControl>

                <FormControl isInvalid={!!errors.confirmPassword}>
                  <FormLabel fontWeight="medium">Confirm Password</FormLabel>
                  <Input
                    type="password"
                    placeholder="Repeat your password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    size="lg"
                    borderRadius="lg"
                  />
                  <FormErrorMessage>{errors.confirmPassword}</FormErrorMessage>
                </FormControl>

                <Button
                  type="submit"
                  colorScheme="blue"
                  size="lg"
                  w="full"
                  borderRadius="lg"
                  isLoading={registerMutation.isPending}
                  loadingText="Creating account..."
                  mt={2}
                >
                  Create Account
                </Button>
              </VStack>
            </form>

            <Divider my={6} />

            <Text textAlign="center" fontSize="sm" color="gray.500">
              Already have an account?{' '}
              <Text as={Link} to="/login" color="blue.400" fontWeight="medium" _hover={{ textDecoration: 'underline' }}>
                Sign in
              </Text>
            </Text>
          </CardBody>
        </Card>
      </Box>
    </Box>
  );
}
