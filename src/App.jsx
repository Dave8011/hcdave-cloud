import React, { useState, useEffect, useCallback } from 'react';
import { LoginPage }        from './components/LoginPage';
import { IntroAnimation }   from './components/IntroAnimation';
import { Sidebar }          from './components/Sidebar';
import { TopBar }           from './components/TopBar';
import { FileExplorer }     from './components/FileExplorer';
import { FilePreviewModal } from './components/FilePreviewModal';
import { UploadModal }      from './components/UploadModal';
import { NewFolderModal }   from './components/NewFolderModal';
import { SettingsModal }    from './components/SettingsModal';
import { SharePage }        from './components/SharePage';
import { StorageService }   from './services/api';

/*
  App State Machine:
    'intro'   → full cinematic D-mark (app load / page refresh)
    'login'   → login page
    'flash'   → quick 1-second D-mark flash (between transitions)
    'app'     → main file explorer
*/
export default function App() {
  const isShareLink = window.location.pathname.startsWith('/s/');
  const [screen,       setScreen]      = useState('intro'); // always start with intro
  const [flashTarget,  setFlashTarget] = useState(null);    // where to go after flash
  const [drives,        setDrives]     = useState([]);
  const [activeDriveId, setActiveDriveId] = useState(null);
  const [activeTab,    setActiveTab]   = useState('all');
  const [currentPath,  setCurrentPath] = useState('/');
  const [search,       setSearch]      = useState('');
  const [files,        setFiles]       = useState([]);
  const [isLoading,    setIsLoading]   = useState(false);
  const [selectedFile, setSelectedFile]= useState(null);
  const [showUpload,   setShowUpload]  = useState(false);
  const [showNewFolder,setShowNewFolder] = useState(false);
  const [showSettings, setShowSettings]= useState(false);
  const [isSidebarOpen, setIsSidebarOpen]= useState(false);

  /* Flash helper — show quick D then go somewhere */
  const flashTo = useCallback((target) => {
    setFlashTarget(target);
    setScreen('flash');
  }, []);

  /* Drive + file loading */
  const loadDrives = useCallback(async () => {
    const list = await StorageService.getDrives();
    setDrives(list);
    if (list.length && !activeDriveId) setActiveDriveId(list[0].id);
  }, [activeDriveId]);

  const loadFiles = useCallback(async () => {
    if (!activeDriveId) return;
    setIsLoading(true);
    setFiles([]); // Clear files immediately to prevent double-clicks
    try {
      const all = await StorageService.listFiles(activeDriveId, currentPath);
      setFiles(
        search.trim()
          ? all.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
          : all
      );
    } finally {
      setIsLoading(false);
    }
  }, [activeDriveId, currentPath, search]);

  useEffect(() => {
    if (screen === 'app') { 
      loadDrives();
      const interval = setInterval(loadDrives, 3000);
      return () => clearInterval(interval);
    }
  }, [screen, loadDrives]);

  useEffect(() => {
    if (screen === 'app') { loadFiles(); }
  }, [activeDriveId, currentPath, search, screen]);

  /* ── Logout: flash then go to login ── */
  const handleLogout = () => {
    StorageService.logout();
    setDrives([]);
    setFiles([]);
    setActiveDriveId(null);
    flashTo('login');
  };

  /* ── Login success: flash then go to app ── */
  const handleLoginSuccess = () => {
    flashTo('app');
  };

  /* ── Full intro → next screen ── */
  if (screen === 'intro') {
    return (
      <IntroAnimation
        fast={isShareLink}
        onDone={() => {
          if (isShareLink) setScreen('share');
          else setScreen(StorageService.isLoggedIn() ? 'app' : 'login');
        }}
      />
    );
  }

  /* ── Quick flash between states ── */
  if (screen === 'flash') {
    return (
      <IntroAnimation
        fast={true}
        onDone={() => setScreen(flashTarget || 'login')}
      />
    );
  }

  /* ── Login ── */
  if (screen === 'login') {
    return (
      <>
        <LoginPage 
          onSuccess={handleLoginSuccess} 
          onOpenSettings={() => setShowSettings(true)} 
        />
        {showSettings && (
          <SettingsModal
            onClose={() => setShowSettings(false)}
            onSave={() => {}}
          />
        )}
      </>
    );
  }

  /* ── Public Share Page ── */
  if (screen === 'share') {
    const token = window.location.pathname.split('/s/')[1];
    return <SharePage token={token} onGoHome={() => { window.history.pushState({}, '', '/'); setScreen('login'); }} />;
  }

  /* ── Main App ── */
  const activeDrive = drives.find(d => d.id === activeDriveId);

  return (
    <div className="app-container">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
      )}

      <Sidebar
        drives={drives}
        activeDriveId={activeDriveId}
        setActiveDriveId={(id) => { 
          setActiveDriveId(id); 
          setCurrentPath('/'); 
          setIsSidebarOpen(false); // Auto-close on mobile
        }}
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setIsSidebarOpen(false);
        }}
        isOpen={isSidebarOpen}
      />

      <main className="main-content">
        <TopBar
          search={search}
          setSearch={setSearch}
          onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          onUpload={() => setShowUpload(true)}
          onNewFolder={() => setShowNewFolder(true)}
          onSettings={() => setShowSettings(true)}
          onLogout={handleLogout}
        />

        <FileExplorer
          files={files}
          isLoading={isLoading}
          activeDrive={activeDrive}
          currentPath={currentPath}
          setCurrentPath={(p) => { setCurrentPath(p); setSearch(''); }}
          onSelectFile={setSelectedFile}
        />
      </main>

      {selectedFile && (
        <FilePreviewModal
          file={selectedFile}
          driveId={activeDriveId}
          onClose={() => setSelectedFile(null)}
        />
      )}

      {showUpload && (
        <UploadModal
          activeDrive={activeDrive}
          currentPath={currentPath}
          onClose={() => setShowUpload(false)}
          onUploadComplete={loadFiles}
        />
      )}

      {showNewFolder && (
        <NewFolderModal
          activeDriveId={activeDriveId}
          currentPath={currentPath}
          onClose={() => setShowNewFolder(false)}
          onSuccess={loadFiles}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSave={() => { loadDrives(); loadFiles(); }}
        />
      )}
    </div>
  );
}
