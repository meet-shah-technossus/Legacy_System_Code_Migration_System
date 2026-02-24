import { Box, Flex } from '@chakra-ui/react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

/**
 * Shared shell for ALL protected routes.
 * Renders the Navbar at the top and gives the remaining height to <Outlet />.
 * The Studio (VSCodeLayout) fills that remainder with overflow:hidden so
 * it never leaks scroll. Standard pages use their own inner scroll.
 */
export default function NavbarShell() {
  return (
    <Flex direction="column" h="100vh" overflow="hidden">
      <Navbar />
      {/* flex=1 + minH=0 allows children to fill exactly the remaining height */}
      <Box flex={1} minH={0} display="flex" flexDirection="column" overflow="hidden">
        <Outlet />
      </Box>
    </Flex>
  );
}
