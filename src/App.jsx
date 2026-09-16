import React, { useState, useEffect, useCallback } from 'react';
import { LoginPage }        from './components/LoginPage';
import { IntroAnimation }   from './components/IntroAnimation';
import { Sidebar }          from './components/Sidebar';
import { TopBar }           from './components/TopBar';
import { FileExplorer }     from './components/FileExplorer';
import { FilePreviewModal } from './components/FilePreviewModal';
import { UploadModal }      from './components/UploadModal';
import { SettingsModal }    from './components/SettingsModal';
import { StorageService }   from './services/api';

/*
  App State Machine:
    'intro'   → full cinematic D-mark (app load / page refresh)
    'login'   → login page
    'flash'   → quick 1-second D-mark flash (between transitions)
    'app'     → main file explorer
*/
export default function App() {
  const [screen,       setScreen]      = useState('intro'); // always start with intro
  const [flashTarget,  setFlashTarget] = useState(null);    // where to go after flash
  const [drives,        setDrives]     = useState([]);
  const [activeDriveId, setActiveDriveId] = useState(null);
  const [activeTab,    setActiveTab]   = useState('all');
  const [currentPath,  setCurrentPath] = useState('/');
  const [search,       setSearch]      = useState('');
  const [files,        setFiles]       = useState([]);
  const [selectedFile, setSelectedFile]= useState(null);
  const [showUpload,   setShowUpload]  = useState(false);
  const [showSettings, setShowSettings]= useState(false);

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
    const all = await StorageService.listFiles(activeDriveId, currentPath);
    setFiles(
      search.trim()
        ? all.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
        : all
    );
  }, [activeDriveId, currentPath, search]);

  useEffect(() => {
    if (screen === 'app') { loadDrives(); }
  }, [screen]);

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

  /* ── Full intro → login ── */
  if (screen === 'intro') {
    return (
      <IntroAnimation
        fast={false}
        onDone={() =>
          setScreen(StorageService.isLoggedIn() ? 'app' : 'login')
        }
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
    return <LoginPage onSuccess={handleLoginSuccess} />;
  }

  /* ── Main App ── */
  const activeDrive = drives.find(d => d.id === activeDriveId);

  return (
    <div className="app-container">
      <Sidebar
        drives={drives}
        activeDriveId={activeDriveId}
        setActiveDriveId={(id) => { setActiveDriveId(id); setCurrentPath('/'); }}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <main className="main-content">
        <TopBar
          search={search}
          setSearch={setSearch}
          onUpload={() => setShowUpload(true)}
          onSettings={() => setShowSettings(true)}
          onLogout={handleLogout}
        />

        <FileExplorer
          files={files}
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

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSave={() => { loadDrives(); loadFiles(); }}
        />
      )}
    </div>
  );
}
