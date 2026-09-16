import React, { useState, useEffect } from 'react';
import { LoginPage }       from './components/LoginPage';
import { Sidebar }         from './components/Sidebar';
import { TopBar }          from './components/TopBar';
import { FileExplorer }    from './components/FileExplorer';
import { FilePreviewModal} from './components/FilePreviewModal';
import { UploadModal }     from './components/UploadModal';
import { SettingsModal }   from './components/SettingsModal';
import { StorageService }  from './services/api';

export default function App() {
  const [loggedIn,      setLoggedIn]      = useState(StorageService.isLoggedIn());
  const [drives,        setDrives]        = useState([]);
  const [activeDriveId, setActiveDriveId] = useState(null);
  const [activeTab,     setActiveTab]     = useState('all');
  const [currentPath,   setCurrentPath]   = useState('/');
  const [search,        setSearch]        = useState('');
  const [files,         setFiles]         = useState([]);
  const [selectedFile,  setSelectedFile]  = useState(null);
  const [showUpload,    setShowUpload]    = useState(false);
  const [showSettings,  setShowSettings]  = useState(false);

  /* ── Drive loading ── */
  const loadDrives = async () => {
    const list = await StorageService.getDrives();
    setDrives(list);
    if (list.length && !activeDriveId) setActiveDriveId(list[0].id);
  };

  /* ── File loading ── */
  const loadFiles = async () => {
    if (!activeDriveId) return;
    const all = await StorageService.listFiles(activeDriveId, currentPath);
    setFiles(
      search.trim()
        ? all.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
        : all
    );
  };

  useEffect(() => { if (loggedIn) loadDrives(); }, [loggedIn]);
  useEffect(() => { if (loggedIn) loadFiles();  }, [activeDriveId, currentPath, search, loggedIn]);

  const handleLogout = () => {
    StorageService.logout();
    setLoggedIn(false);
    setDrives([]);
    setFiles([]);
    setActiveDriveId(null);
  };

  /* ── Not authenticated ── */
  if (!loggedIn) {
    return <LoginPage onSuccess={() => setLoggedIn(true)} />;
  }

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

      {/* ── Modals ── */}
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
