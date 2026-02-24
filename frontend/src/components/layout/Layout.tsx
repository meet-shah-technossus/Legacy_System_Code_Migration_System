import { Box, useColorModeValue } from '@chakra-ui/react';
import { Outlet } from 'react-router-dom';

/**
 * Inner layout for standard pages (dashboard, jobs, etc.).
 * Navbar is provided by the parent NavbarShell — this just adds
 * the content wrapper with padding / max-width.
 */
export default function Layout() {
  const bg = useColorModeValue('gray.50', 'gray.900');

  return (
    <Box flex={1} bg={bg} overflowY="auto">
      <Box as="main" maxW="1400px" mx="auto" px={{ base: 4, md: 6, lg: 8 }} py={6}>
        <Outlet />
      </Box>
    </Box>
  );
}
