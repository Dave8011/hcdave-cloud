import re

with open('src/components/FileExplorer.jsx', 'r') as f:
    code = f.read()

# 1. Import StorageService
code = code.replace("import { ShareModal } from './ShareModal';", "import { ShareModal } from './ShareModal';\nimport { StorageService } from '../services/api';")

# 2. Add selectedFiles state
code = code.replace("const [shareFile, setShareFile] = useState(null);", "const [shareFile, setShareFile] = useState(null);\n  const [selectedFiles, setSelectedFiles] = useState(new Set());")

# 3. Add toggle function and download handler
toggle_func = """
  const toggleSelect = (file, e) => {
    e.stopPropagation();
    const newSet = new Set(selectedFiles);
    if (newSet.has(file.path)) {
      newSet.delete(file.path);
    } else {
      newSet.add(file.path);
    }
    setSelectedFiles(newSet);
  };

  const handleDownloadZip = async () => {
    if (selectedFiles.size === 0) return;
    try {
      await StorageService.downloadZip(activeDrive.id, Array.from(selectedFiles));
      setSelectedFiles(new Set());
    } catch (e) {
      alert('Failed to download ZIP: ' + e.message);
    }
  };
"""
code = code.replace("const navigate = (file) => {", toggle_func + "\n  const navigate = (file) => {")

# 4. Grid view: add checkbox and thumbnail
grid_search = """<div key={file.id} className="file-card" onClick={() => navigate(file)}>
                <div className="card-top">
                  <div className={`file-icon ${cls}`}>
                    <Icon size={22} />
                  </div>"""

grid_replace = """<div key={file.id} className={`file-card ${selectedFiles.has(file.path) ? 'selected' : ''}`} onClick={() => navigate(file)} style={{ position: 'relative' }}>
                <div className="card-checkbox" onClick={(e) => toggleSelect(file, e)}>
                  <input type="checkbox" checked={selectedFiles.has(file.path)} readOnly />
                </div>
                <div className="card-top">
                  <div className={`file-icon ${cls}`}>
                    {file.type === 'image' ? (
                      <img src={StorageService.getThumbnailUrl(activeDrive.id, file.path)} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--r-md)' }} alt={file.name} />
                    ) : (
                      <Icon size={22} />
                    )}
                  </div>"""
code = code.replace(grid_search, grid_replace)

# 5. List view: add checkbox and thumbnail
list_search = """<div
                key={file.id}
                className="list-row"
                style={{ animationDelay: `${i * 0.04}s` }}
                onClick={() => navigate(file)}
              >
                <div className={`file-icon ${cls}`} style={{ width: 32, height: 32 }}>
                  <Icon size={17} />
                </div>"""
list_replace = """<div
                key={file.id}
                className={`list-row ${selectedFiles.has(file.path) ? 'selected' : ''}`}
                style={{ animationDelay: `${i * 0.04}s` }}
                onClick={() => navigate(file)}
              >
                <div className="list-checkbox" onClick={(e) => toggleSelect(file, e)} style={{ marginRight: 12 }}>
                  <input type="checkbox" checked={selectedFiles.has(file.path)} readOnly />
                </div>
                <div className={`file-icon ${cls}`} style={{ width: 32, height: 32, overflow: 'hidden' }}>
                  {file.type === 'image' ? (
                    <img src={StorageService.getThumbnailUrl(activeDrive.id, file.path)} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={file.name} />
                  ) : (
                    <Icon size={17} />
                  )}
                </div>"""
code = code.replace(list_search, list_replace)

# 6. Desktop-only for Share button
code = code.replace("className=\"card-action btn-icon\"", "className=\"card-action btn-icon desktop-only\"")

# Wait, in list view, it doesn't use className for Share button, it just has style.
# Let's add className="desktop-only" to the Share button in list view.
list_share_search = """<button
                    style={{ padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', marginRight: 4 }}
                    onClick={() => setShareFile(file)}
                    title="Share"
                  >"""
list_share_replace = """<button
                    className="desktop-only"
                    style={{ padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', marginRight: 4 }}
                    onClick={(e) => { e.stopPropagation(); setShareFile(file); }}
                    title="Share"
                  >"""
code = code.replace(list_share_search, list_share_replace)
# Wait, list view Share button didn't have e.stopPropagation() previously. The div has onClick={(e) => e.stopPropagation()} around all actions.

# 7. Add Floating Action Bar
action_bar = """
      {selectedFiles.size > 0 && (
        <div className="floating-action-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontWeight: 600 }}>{selectedFiles.size} selected</span>
            <button className="btn-secondary" onClick={() => setSelectedFiles(new Set())}>Clear</button>
          </div>
          <button className="btn-primary" onClick={handleDownloadZip}>Download Zip</button>
        </div>
      )}
"""
code = code.replace("    </div>\n  );\n}", action_bar + "    </div>\n  );\n}")

with open('src/components/FileExplorer.jsx', 'w') as f:
    f.write(code)

print("Done")
