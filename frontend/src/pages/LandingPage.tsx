import { useState, useCallback } from 'react';
import { VSCodeLayout, ExplorerPanel, EditorPanel, ChatPanel } from '../components/vscode';
import type { ActivityBarTab } from '../components/vscode';
import type { PendingLineComment } from '../types';

/**
 * Full-screen VS Code-style landing page.
 *  - selectedJobId   : lifted so Explorer + EditorPanel share state
 *  - pendingLineComments : lifted so EditorPanel (creation) and ChatPanel (chips) share state
 */
export default function LandingPage() {
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
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

  // Clear line comments when a different job is selected
  const handleSelectJob = useCallback((id: number | null) => {
    setSelectedJobId(id);
    setPendingLineComments([]);
  }, []);

  return (
    <VSCodeLayout
      titleSubtitle={selectedJobId ? `Job #${selectedJobId}` : undefined}
      explorer={(activeTab: ActivityBarTab | null) => (
        <ExplorerPanel
          activeTab={activeTab}
          selectedJobId={selectedJobId}
          onSelectJob={handleSelectJob}
          jobTypeFilter="two-step"
        />
      )}
      editor={
        <EditorPanel
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
