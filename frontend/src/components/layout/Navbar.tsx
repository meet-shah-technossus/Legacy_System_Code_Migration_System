import {
  Box,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  HStack,
  Icon,
  IconButton,
  Text,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  Avatar,
  useColorMode,
  useColorModeValue,
  useDisclosure,
  Badge,
  VStack,
  Divider,
} from '@chakra-ui/react';
import { MoonIcon, SunIcon, HamburgerIcon } from '@chakra-ui/icons';
import { FiGrid, FiCode, FiCheckSquare, FiBarChart2, FiActivity, FiSettings, FiLogOut, FiLayout } from 'react-icons/fi';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import NotificationBell from '../common/NotificationBell';

const NAV_LINKS = [
  { label: 'Studio',    to: '/',          icon: FiLayout, exact: true },
  { label: 'Dashboard', to: '/dashboard', icon: FiGrid },
  { label: 'Jobs',      to: '/jobs',      icon: FiCode },
  { label: 'Reviews',   to: '/reviews',   icon: FiCheckSquare },
  { label: 'Analytics', to: '/analytics', icon: FiBarChart2 },
  { label: 'Audit',     to: '/audit',     icon: FiActivity },
];

export default function Navbar() {
  const { colorMode, toggleColorMode } = useColorMode();
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const activeLinkColor = useColorModeValue('blue.600', 'blue.300');
  const inactiveLinkColor = useColorModeValue('gray.600', 'gray.300');
  const drawerBg = useColorModeValue('white', 'gray.900');
  const drawerActiveBg = useColorModeValue('blue.50', 'blue.900');
  const drawerHoverBg = useColorModeValue('gray.100', 'gray.700');
  const drawerLogoutHoverBg = useColorModeValue('red.50', 'red.900');
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { isOpen: isDrawerOpen, onOpen: onDrawerOpen, onClose: onDrawerClose } = useDisclosure();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (to: string, exact?: boolean) =>
    exact
      ? location.pathname === to
      : to === '/dashboard'
        ? location.pathname === '/dashboard'
        : location.pathname.startsWith(to);

  return (
    <Box
      as="nav"
      bgColor={bg}
      borderBottom="1px"
      borderColor={borderColor}
      px={6}
      py={3}
      position="sticky"
      top={0}
      zIndex={100}
      boxShadow="sm"
    >
      <Flex align="center" justify="space-between">
        {/* Logo */}
        <HStack spacing={3}>
          {/* Hamburger – visible only on mobile */}
          <IconButton
            aria-label="Open navigation"
            icon={<HamburgerIcon />}
            variant="ghost"
            size="sm"
            display={{ base: 'flex', md: 'none' }}
            onClick={onDrawerOpen}
          />
          <Text fontSize="xl" fontWeight="bold" color="blue.500">
            🔄
          </Text>
          <Text fontSize="lg" fontWeight="bold">
            Legacy Migration
          </Text>
          <Badge colorScheme="blue" variant="subtle" fontSize="xs">
            BETA
          </Badge>
        </HStack>

        {/* Desktop nav links */}
        <HStack spacing={6} display={{ base: 'none', md: 'flex' }}>
          {NAV_LINKS.map((link) => {
            const active = isActive(link.to, link.exact);
            return (
              <Text
                key={link.to}
                as={Link}
                to={link.to}
                fontSize="sm"
                fontWeight={active ? 'semibold' : 'medium'}
                color={active ? activeLinkColor : inactiveLinkColor}
                borderBottom={active ? '2px solid' : '2px solid transparent'}
                borderColor={active ? activeLinkColor : 'transparent'}
                pb={0.5}
                _hover={{ color: 'blue.500' }}
              >
                {link.label}
              </Text>
            );
          })}
        </HStack>

        {/* Right side actions */}
        <HStack spacing={3}>
          <NotificationBell />
          <IconButton
            aria-label="Toggle color mode"
            icon={colorMode === 'dark' ? <SunIcon /> : <MoonIcon />}
            onClick={toggleColorMode}
            variant="ghost"
            size="sm"
          />

          <Menu>
            <MenuButton>
              <Avatar
                size="sm"
                name={user?.full_name || user?.username || 'User'}
                bg="blue.500"
                cursor="pointer"
              />
            </MenuButton>
            <MenuList>
              <Box px={3} py={2}>
                <Text fontWeight="medium">{user?.full_name || user?.username}</Text>
                <Text fontSize="xs" color="gray.500">
                  {user?.email}
                </Text>
                <Badge colorScheme="purple" fontSize="xs" mt={1}>
                  {user?.role}
                </Badge>
              </Box>
              <MenuDivider />
              <MenuItem onClick={() => navigate('/settings')}>
                Settings
              </MenuItem>
              <MenuItem onClick={handleLogout} color="red.400">
                Logout
              </MenuItem>
            </MenuList>
          </Menu>
        </HStack>
      </Flex>

      {/* ── Mobile Drawer ──────────────────────────────────────── */}
      <Drawer isOpen={isDrawerOpen} placement="left" onClose={onDrawerClose} size="xs">
        <DrawerOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
        <DrawerContent bg={drawerBg}>
          <DrawerCloseButton />
          <DrawerHeader borderBottomWidth="1px">
            <HStack spacing={2}>
              <Text color="blue.400">🔄</Text>
              <Text fontSize="md" fontWeight="bold">Legacy Migration</Text>
            </HStack>
          </DrawerHeader>
          <DrawerBody px={3} py={4}>
            <VStack align="stretch" spacing={1}>
              {/* User info */}
              <Box px={3} py={3} mb={1}>
                <HStack spacing={3}>
                  <Avatar
                    size="sm"
                    name={user?.full_name || user?.username || 'User'}
                    bg="blue.500"
                  />
                  <Box>
                    <Text fontSize="sm" fontWeight="semibold">
                      {user?.full_name || user?.username}
                    </Text>
                    <Text fontSize="xs" color="gray.400">{user?.email}</Text>
                  </Box>
                </HStack>
              </Box>
              <Divider />

              {/* Nav links */}
              {NAV_LINKS.map((link) => {
                const active = isActive(link.to, link.exact);
                return (
                  <Flex
                    key={link.to}
                    as={Link}
                    to={link.to}
                    onClick={onDrawerClose}
                    align="center"
                    gap={3}
                    px={3}
                    py={2.5}
                    borderRadius="lg"
                    fontWeight={active ? 'semibold' : 'medium'}
                    fontSize="sm"
                    color={active ? activeLinkColor : inactiveLinkColor}
                    bg={active ? drawerActiveBg : 'transparent'}
                    _hover={{
                      bg: drawerHoverBg,
                      textDecoration: 'none',
                    }}
                    transition="background 0.15s"
                  >
                    <Icon as={link.icon} boxSize={4} />
                    {link.label}
                  </Flex>
                );
              })}

              <Divider my={2} />

              {/* Settings */}
              <Flex
                as={Link}
                to="/settings"
                onClick={onDrawerClose}
                align="center"
                gap={3}
                px={3}
                py={2.5}
                borderRadius="lg"
                fontSize="sm"
                color={isActive('/settings') ? activeLinkColor : inactiveLinkColor}
                fontWeight={isActive('/settings') ? 'semibold' : 'medium'}
                _hover={{ bg: drawerHoverBg, textDecoration: 'none' }}
                transition="background 0.15s"
              >
                <Icon as={FiSettings} boxSize={4} />
                Settings
              </Flex>

              {/* Logout */}
              <Flex
                as="button"
                align="center"
                gap={3}
                px={3}
                py={2.5}
                borderRadius="lg"
                fontSize="sm"
                color="red.400"
                fontWeight="medium"
                w="full"
                onClick={() => { onDrawerClose(); handleLogout(); }}
                _hover={{ bg: drawerLogoutHoverBg }}
                transition="background 0.15s"
              >
                <Icon as={FiLogOut} boxSize={4} />
                Logout
              </Flex>
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </Box>
  );
}
