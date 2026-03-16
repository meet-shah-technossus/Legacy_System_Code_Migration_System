/**
 * DirectStudioPage.tsx
 *
 * Full-screen VS Code-style page for Direct Conversion jobs.
 * URL param: /direct-studio/:jobId
 *
 * Architecture mirrors LandingPage.tsx:
 *  - VSCodeLayout + ExplorerPanel (explorer sidebar, job selection)
 *  - DirectEditorPanel (code editor with all draft/version/review features)
 *  - ChatPanel (AI assistant with line comment context)
 *
 * The difference from LandingPage:
 *  - The URL jobId is loaded directly (user navigates here after creating a
 *    Direct Conversion job from CreateJobPage)
 *  - The explorer still shows all jobs, but the initial selection is fixed to
 *    the URL job — the user can switch to any job in the explorer
 *  - DirectEditorPanel is used instead of EditorPanel (no YAML tab, shows
 *    direct generation workflow)
 */

import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { VSCodeLayout, ExplorerPanel, ChatPanel } from '../components/vscode';
import type { ActivityBarTab } from '../components/vscode';
import DirectEditorPanel from '../components/vscode/DirectEditorPanel';
import type { PendingLineComment } from '../types';

export default function DirectStudioPage() {
  const { jobId: jobIdParam } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  // Parse URL param; redirect to / if invalid
  const urlJobId = jobIdParam ? parseInt(jobIdParam, 10) : null;
  useEffect(() => {
    if (jobIdParam && isNaN(Number(jobIdParam))) {
      navigate('/', { replace: true });
    }
  }, [jobIdParam, navigate]);

  // The currently selected job — seeded from URL, can be changed by explorer
  const [selectedJobId, setSelectedJobId] = useState<number | null>(
    urlJobId && !isNaN(urlJobId) ? urlJobId : null
  );

  // Sync state when URL param changes (browser back/forward, external navigation)
  useEffect(() => {
    if (urlJobId && !isNaN(urlJobId) && urlJobId !== selectedJobId) {
      setSelectedJobId(urlJobId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlJobId]);

  // Pending inline line comment chips (shared between editor and chat)
  const [pendingLineComments, setPendingLineComments] = useState<PendingLineComment[]>([]);

  const addPendingLineComment = useCallback((c: PendingLineComment) => {
    setPendingLineComments(prev => [...prev, c]);
  }, []);

  const removePendingLineComment = useCallback((id: string) => {
    setPendingLineComments(prev => prev.filter(c => c.id !== id));
  }, []);

  const clearPendingLineComments = useCallback(() => {
    setPendingLineComments([]);
  }, []);

  // Clear line comments when switching jobs
  const handleSelectJob = useCallback((id: number | null) => {
    setSelectedJobId(id);
    setPendingLineComments([]);
  }, []);

  // Update URL when job changes so the page is bookmarkable
  useEffect(() => {
    if (selectedJobId && selectedJobId !== urlJobId) {
      navigate(`/direct-studio/${selectedJobId}`, { replace: true });
    }
  }, [selectedJobId, urlJobId, navigate]);

  return (
    <VSCodeLayout
      titleSubtitle={selectedJobId ? `Direct #${selectedJobId}` : 'Direct Studio'}
      excludeTabs={['queue']}
      explorer={(activeTab: ActivityBarTab | null) => (
        <ExplorerPanel
          activeTab={activeTab}
          selectedJobId={selectedJobId}
          onSelectJob={handleSelectJob}
          jobTypeFilter="direct"
        />
      )}
      editor={
        <DirectEditorPanel
          jobId={selectedJobId}
          pendingLineComments={pendingLineComments}
          onAddLineComment={addPendingLineComment}
          onClearLineComments={clearPendingLineComments}
        />
      }
      chat={
        <ChatPanel
          jobId={selectedJobId}
          lineComments={pendingLineComments}
          onRemoveLineComment={removePendingLineComment}
        />
      }
    />
  );
}
