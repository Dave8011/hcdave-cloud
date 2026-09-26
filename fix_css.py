with open('src/index.css', 'r') as f:
    css = f.read()

# 1. Truncate list-name
list_name_old = """
.list-name {
  flex: 1;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 12px;
}
"""
list_name_new = """
.list-name {
  flex: 1;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.list-name span.truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
"""
css = css.replace(list_name_old.strip(), list_name_new.strip())

# 2. Fix checkboxes
checkbox_old = """
.card-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  background: var(--bg-card);
  border-radius: 4px;
  padding: 4px;
  display: flex;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
"""
checkbox_new = """
.card-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  background: rgba(15, 15, 20, 0.6);
  backdrop-filter: blur(8px);
  border-radius: 50%;
  padding: 4px;
  display: flex;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  border: 1px solid rgba(255,255,255,0.1);
}
"""
css = css.replace(checkbox_old.strip(), checkbox_new.strip())

# 3. Fix floating action bar
fab_old = """
.floating-action-bar {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 12px 24px;
  display: flex;
  gap: 24px;
  align-items: center;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  z-index: 100;
  animation: slideUp 0.3s ease-out;
}
"""
fab_new = """
.floating-action-bar {
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(20, 20, 25, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 30px;
  padding: 10px 20px;
  display: flex;
  gap: 24px;
  align-items: center;
  box-shadow: 0 12px 40px rgba(0,0,0,0.6);
  z-index: 100;
  animation: slideUp 0.3s ease-out;
}
.floating-action-bar .btn-secondary {
  background: transparent;
  border: none;
  color: var(--text-2);
}
.floating-action-bar .btn-primary {
  background: var(--blue);
  color: white;
  border-radius: 20px;
  padding: 8px 16px;
  border: none;
}
"""
css = css.replace(fab_old.strip(), fab_new.strip())

with open('src/index.css', 'w') as f:
    f.write(css)

print("Done")
