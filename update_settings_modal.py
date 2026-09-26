import re

with open('src/components/SettingsModal.jsx', 'r') as f:
    code = f.read()

# Add showConfirm state
code = code.replace("const [updateMsg, setUpdateMsg] = useState('');", "const [updateMsg, setUpdateMsg] = useState('');\n  const [showConfirm, setShowConfirm] = useState(false);")

# Change handleUpdate to check if it's confirmed
update_func = """
  const triggerUpdate = async () => {
    setShowConfirm(false);
    try {
      setIsUpdating(true);
      setUpdateMsg('Sending update command...');
      const res = await StorageService.updateAgent();
      setUpdateMsg(res.message || 'Update started. Waiting for server restart...');
"""
code = code.replace("  const handleUpdate = async () => {\n    if (!window.confirm('This will update the backend on your Home Server to the latest GitHub code and restart it. Continue?')) return;\n    try {\n      setIsUpdating(true);\n      setUpdateMsg('Sending update command...');\n      const res = await StorageService.updateAgent();\n      setUpdateMsg(res.message || 'Update started. Waiting for server restart...');", update_func)

# Change the Update button to show confirm
code = code.replace("onClick={handleUpdate}", "onClick={() => setShowConfirm(true)}")

# Add the Confirm Modal JSX
confirm_modal = """
      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)} style={{ zIndex: 1000, background: 'rgba(0,0,0,0.8)' }}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 320, animation: 'scaleIn 0.2s ease-out' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ background: 'rgba(99,102,241,0.1)', width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <RefreshCw size={32} color="var(--indigo)" />
              </div>
              <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-1)' }}>Update Server</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
                This will securely download the latest software to your Home Server and restart the backend.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={triggerUpdate}>Update Now</button>
            </div>
          </div>
        </div>
      )}
"""
code = code.replace("    <div className=\"modal-overlay\" onClick={onClose}>", "    <div className=\"modal-overlay\" onClick={onClose}>\n" + confirm_modal)

with open('src/components/SettingsModal.jsx', 'w') as f:
    f.write(code)

print("Done")
