import React, { useState, useEffect, useCallback } from 'react';
import { LoginPage }        from './components/LoginPage';
import { IntroAnimation }   from './components/IntroAnimation';
import { Sidebar }          from './components/Sidebar';
import { TopBar }           from './components/TopBar';
import { FileExplorer }     from './components/FileExplorer';
import { UploadModal }      from './components/UploadModal';
import { NewFolderModal }   from './components/NewFolderModal';
import { SettingsModal }    from './components/SettingsModal';
import { SharePage }        from './components/SharePage';
import { StorageService }   from './services/api';
import { ErrorBoundary }    from './components/ErrorBoundary';

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
  const [showUpload,   setShowUpload]  = useState(false);
  const [showNewFolder,setShowNewFolder] = useState(false);
  const [showSettings, setShowSettings]= useState(false);
  const [isSidebarOpen, setIsSidebarOpen]= useState(false);
  const [driveStats, setDriveStats]     = useState([]);

  /* Flash helper — show quick D then go somewhere */
  const flashTo = useCallback((target) => {
    setFlashTarget(target);
    setScreen('flash');
  }, []);

  /* Drive + file loading */
  const loadDrives = useCallback(async () => {
    const rawList = await StorageService.getDrives();
    const roleOrder = { 'Master': 1, 'Gallery': 2, 'Portable': 3, 'Backup': 4, 'Cache': 5, 'Storage': 6 };
    const list = rawList.sort((a, b) => (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99));
    setDrives(list);
    if (list.length && !activeDriveId) setActiveDriveId(list[0].id);
    // Refresh cache drive stats in background
    StorageService.getCacheStatus().then(cs => setDriveStats(cs.driveStats || [])).catch(() => {});
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

  /* ── Scanner Handshake ── */
  const handleScanOpen = () => {
    console.log('[Scanner] button clicked');
    const targetOrigin = 'https://scanner.hcdavecloud.in';
    let tokenRequestInFlight = false;
    let scannerWindow = null;

    const messageListener = async (event) => {
      console.log('[Scanner] message received from:', event.origin);
      if (event.origin !== targetOrigin) return;
      if (event.source !== scannerWindow) return;
      
      console.log('[Scanner] message type:', event.data?.type);
      if (event.data && event.data.type === 'SCANNER_READY') {
        console.log('[Scanner] SCANNER_READY recognized');
        
        if (tokenRequestInFlight) {
          console.log('[Scanner] token request already in flight, ignoring duplicate');
          return;
        }
        
        console.log('[Scanner] requesting scanner token');
        tokenRequestInFlight = true;
        
        try {
          const data = await StorageService.getScannerToken();
          console.log('[Scanner] token received:', !!(data && data.token));
          if (data && data.token) {
            scannerWindow.postMessage({ type: 'AUTH_TOKEN', token: data.token }, targetOrigin);
            console.log('[Scanner] AUTH_TOKEN sent');
          } else {
            throw new Error('No token returned');
          }
        } catch (err) {
          console.error('[Scanner] Failed to authorize scanner.', err);
          alert('Failed to authorize scanner. ' + err.message);
        } finally {
          tokenRequestInFlight = false;
        }
      } else if (event.data && event.data.type === 'SCANNER_DONE') {
        console.log('[Scanner] SCANNER_DONE recognized');
        window.focus();
        scannerWindow.close();
        // The checkClosed interval will detect scannerWindow.closed and handle cleanup.
      }
    };
    
    window.addEventListener('message', messageListener);
    console.log('[Scanner] message listener attached');

    scannerWindow = window.open(targetOrigin, '_blank');
    console.log('[Scanner] window opened:', !!scannerWindow);
    
    if (!scannerWindow || scannerWindow.closed || typeof scannerWindow.closed === 'undefined') {
      alert('Popup blocked. Please allow popups for this site.');
      window.removeEventListener('message', messageListener);
      return;
    }

    const checkClosed = setInterval(() => {
      if (scannerWindow.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', messageListener);
        console.log('[Scanner] listener cleaned up');
      }
    }, 1000);
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
          setIsSidebarOpen(false);
        }}
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setIsSidebarOpen(false);
        }}
        isOpen={isSidebarOpen}
        driveStats={driveStats}
        onCacheDrive={async (driveId) => {
          try {
            await StorageService.startCache([driveId]);
            setShowSettings(true);
          } catch (e) { alert('Cache error: ' + e.message); }
        }}
      />

      <main className="main-content">
        <TopBar
          search={search}
          setSearch={setSearch}
          onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          onUpload={() => setShowUpload(true)}
          onNewFolder={() => setShowNewFolder(true)}
          onScan={handleScanOpen}
          onSettings={() => setShowSettings(true)}
          onLogout={handleLogout}
        />

        <FileExplorer
          files={files}
          isLoading={isLoading}
          activeDrive={activeDrive || { id: activeDriveId, name: 'Drive' }}
          currentPath={currentPath}
          setCurrentPath={(p) => { setCurrentPath(p); setSearch(''); }}
          onRefresh={loadFiles}
        />
      </main>

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
        <ErrorBoundary>
          <SettingsModal
            onClose={() => setShowSettings(false)}
            onSave={() => { loadDrives(); loadFiles(); }}
            drives={drives}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
