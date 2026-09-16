import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { FileExplorer } from './components/FileExplorer';
import { FilePreviewModal } from './components/FilePreviewModal';
import { UploadModal } from './components/UploadModal';
import { SettingsModal } from './components/SettingsModal';
import { StorageService } from './services/api';

export function App() {
  const [drives, setDrives] = useState([]);
  const [activeDriveId, setActiveDriveId] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [currentPath, setCurrentPath] = useState('/');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Load connected dynamic drives
  const loadDrives = async () => {
    const list = await StorageService.getDrives();
    setDrives(list);
    if (list.length > 0 && !activeDriveId) {
      setActiveDriveId(list[0].id);
    }
  };

  // Load files for active drive & path
  const loadFiles = async () => {
    if (!activeDriveId) return;
    const fileList = await StorageService.listFiles(activeDriveId, currentPath);
    if (searchQuery.trim()) {
      setFiles(fileList.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())));
    } else {
      setFiles(fileList);
    }
  };

  useEffect(() => {
    loadDrives();
  }, []);

  useEffect(() => {
    loadFiles();
  }, [activeDriveId, currentPath, searchQuery]);

  const activeDrive = drives.find(d => d.id === activeDriveId) || drives[0];

  return (
    <div className="app-container">
      {/* Dynamic Plug & Play Sidebar */}
      <Sidebar 
        drives={drives}
        activeDriveId={activeDriveId}
        setActiveDriveId={(id) => {
          setActiveDriveId(id);
          setCurrentPath('/');
        }}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Content Explorer */}
      <main className="main-content">
        <TopBar 
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onOpenUpload={() => setShowUploadModal(true)}
          onOpenSettings={() => setShowSettingsModal(true)}
        />

        <FileExplorer 
          files={files}
          activeDrive={activeDrive}
          currentPath={currentPath}
          setCurrentPath={setCurrentPath}
          onSelectFile={(file) => setSelectedFile(file)}
          onDeleteFile={(file) => console.log('Delete file:', file)}
        />
      </main>

      {/* Modals */}
      {selectedFile && (
        <FilePreviewModal 
          file={selectedFile} 
          onClose={() => setSelectedFile(null)} 
        />
      )}

      {showUploadModal && (
        <UploadModal 
          activeDrive={activeDrive}
          onClose={() => setShowUploadModal(false)}
          onUploadComplete={() => loadFiles()}
        />
      )}

      {showSettingsModal && (
        <SettingsModal 
          onClose={() => setShowSettingsModal(false)}
          onSave={() => {
            loadDrives();
            loadFiles();
          }}
        />
      )}
    </div>
  );
}

export default App;
