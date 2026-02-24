import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChakraProvider } from '@chakra-ui/react';
import { Toaster } from 'react-hot-toast';
import theme from './theme';
import Layout from './components/layout/Layout';
import NavbarShell from './components/layout/NavbarShell';
import ProtectedRoute from './components/common/ProtectedRoute';
import ErrorBoundary from './components/common/ErrorBoundary';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import JobsPage from './pages/JobsPage';
import CreateJobPage from './pages/CreateJobPage';
import JobDetailPage from './pages/JobDetailPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AuditLogPage from './pages/AuditLogPage';
import SettingsPage from './pages/SettingsPage';
import ReviewsPage from './pages/ReviewsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ChakraProvider theme={theme}>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#2D3748',
              color: '#fff',
              borderRadius: '10px',
            },
          }}
        />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Protected routes — all share NavbarShell so the Navbar is always visible */}
            <Route element={<ProtectedRoute />}>
              <Route element={<NavbarShell />}>
                {/* VS Code Studio — full remaining height, no extra padding */}
                <Route
                  path="/"
                  element={<ErrorBoundary><LandingPage /></ErrorBoundary>}
                />

                {/* Standard pages — inner Layout adds scroll + max-width padding */}
                <Route element={<Layout />}>
                  <Route path="/dashboard" element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
                  <Route path="/jobs" element={<ErrorBoundary><JobsPage /></ErrorBoundary>} />
                  <Route path="/jobs/new" element={<ErrorBoundary><CreateJobPage /></ErrorBoundary>} />
                  <Route path="/jobs/:id" element={<ErrorBoundary><JobDetailPage /></ErrorBoundary>} />
                  <Route path="/analytics" element={<ErrorBoundary><AnalyticsPage /></ErrorBoundary>} />
                  <Route path="/audit" element={<ErrorBoundary><AuditLogPage /></ErrorBoundary>} />
                  <Route path="/reviews" element={<ErrorBoundary><ReviewsPage /></ErrorBoundary>} />
                  <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
                </Route>
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ChakraProvider>
    </QueryClientProvider>
  );
}
