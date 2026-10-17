import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, X, Folder, Image as Img, Film, FileText, Archive,
  FolderOpen, MapPin, ExternalLink, HardDrive, AlertTriangle,
  SlidersHorizontal, ArrowUpDown, Clock, FileType, Check, Loader2, Sparkles
} from 'lucide-react';
import { StorageService } from '../services/api';

const TYPE_ICONS = {
  folder:   { Icon: Folder,   color: 'var(--amber)',   label: 'Folder' },
  image:    { Icon: Img,      color: 'var(--cyan)',    label: 'Image' },
  video:    { Icon: Film,     color: 'var(--rose)',    label: 'Video' },
  archive:  { Icon: Archive,  color: 'var(--emerald)', label: 'Archive' },
  document: { Icon: FileText, color: 'var(--indigo)',  label: 'Document' },
};

const ROLE_COLORS = {
  Master:   'var(--rose)',
  Gallery:  'var(--amber)',
  Portable: 'var(--cyan)',
  Backup:   'var(--emerald)',
  Cache:    'var(--indigo)',
  Storage:  'var(--violet)',
};

const DATE_OPTIONS = [
  { value: 'all', label: 'Any Time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Past 7 Days' },
  { value: '30d', label: 'Past 30 Days' },
  { value: '1y', label: 'Past Year' },
];

const SIZE_OPTIONS = [
  { value: 'all', label: 'Any Size' },
  { value: 'small', label: '< 1 MB' },
  { value: 'medium', label: '1 MB – 100 MB' },
  { value: 'large', label: '100 MB – 1 GB' },
  { value: 'huge', label: '> 1 GB' },
];

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'largest', label: 'Largest First' },
  { value: 'name', label: 'Name (A–Z)' },
];

export function GlobalSearchModal({
  isOpen,
  onClose,
  drives = [],
  onNavigateToFolder,
  onPreviewFile,
  initialQuery = ''
}) {
  const [query, setQuery] = useState(initialQuery);
  const [driveId, setDriveId] = useState('all');
  const [type, setType] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [sort, setSort] = useState('relevance');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [disconnectedDrives, setDisconnectedDrives] = useState([]);
  const [isDriveOffline, setIsDriveOffline] = useState(false);
  const [offlineDriveName, setOfflineDriveName] = useState('');

  const inputRef = useRef(null);
  const debounceTimer = useRef(null);

  // Sync initial query if passed
  useEffect(() => {
    if (initialQuery !== undefined) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Calculate size filter range
  const getSizeRange = (sizeKey) => {
    if (sizeKey === 'small') return { maxSize: 1024 * 1024 };
    if (sizeKey === 'medium') return { minSize: 1024 * 1024, maxSize: 100 * 1024 * 1024 };
    if (sizeKey === 'large') return { minSize: 100 * 1024 * 1024, maxSize: 1024 * 1024 * 1024 };
    if (sizeKey === 'huge') return { minSize: 1024 * 1024 * 1024 };
    return {};
  };

  // Calculate date filter range
  const getDateRange = (dateKey) => {
    const now = Date.now();
    if (dateKey === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return { modifiedAfter: today.toISOString() };
    }
    if (dateKey === '7d') {
      return { modifiedAfter: new Date(now - 7 * 86400000).toISOString() };
    }
    if (dateKey === '30d') {
      return { modifiedAfter: new Date(now - 30 * 86400000).toISOString() };
    }
    if (dateKey === '1y') {
      return { modifiedAfter: new Date(now - 365 * 86400000).toISOString() };
    }
    return {};
  };

  // Perform search
  const performSearch = useCallback(async () => {
    if (!query.trim() && type === 'all' && driveId === 'all' && dateFilter === 'all' && sizeFilter === 'all') {
      setResults([]);
      setTotal(0);
      setLoading(false);
      setIsDriveOffline(false);
      return;
    }

    setLoading(true);
    setIsDriveOffline(false);

    try {
      const { minSize, maxSize } = getSizeRange(sizeFilter);
      const { modifiedAfter } = getDateRange(dateFilter);

      const res = await StorageService.searchAllDrives({
        q: query.trim(),
        driveId: driveId === 'all' ? undefined : driveId,
        type: type === 'all' ? undefined : type,
        minSize,
        maxSize,
        modifiedAfter,
        sort,
        limit: 150
      });

      if (res.isDriveOffline) {
        setIsDriveOffline(true);
        setOfflineDriveName(res.offlineDriveName || 'Selected Drive');
        setResults([]);
        setTotal(0);
      } else {
        setResults(res.results || []);
        setTotal(res.total || 0);
        setDisconnectedDrives(res.disconnectedDrives || []);
      }
    } catch (e) {
      console.error('Search error:', e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, driveId, type, dateFilter, sizeFilter, sort]);

  // Live debounced search
  useEffect(() => {
    if (!isOpen) return;
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      performSearch();
    }, 280);

    return () => clearTimeout(debounceTimer.current);
  }, [isOpen, performSearch]);

  if (!isOpen) return null;

  const activeFiltersCount = (driveId !== 'all' ? 1 : 0) +
    (type !== 'all' ? 1 : 0) +
    (dateFilter !== 'all' ? 1 : 0) +
    (sizeFilter !== 'all' ? 1 : 0) +
    (sort !== 'relevance' ? 1 : 0);

  const resetFilters = () => {
    setDriveId('all');
    setType('all');
    setDateFilter('all');
    setSizeFilter('all');
    setSort('relevance');
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ padding: '16px', zIndex: 1100, alignItems: 'flex-start' }}>
      <div
        className="modal-box search-modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 820,
          maxHeight: '90vh',
          marginTop: '4vh',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(15, 20, 30, 0.98)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: 18,
          boxShadow: '0 25px 60px rgba(0,0,0,0.7), 0 0 40px rgba(99,102,241,0.12)',
          overflow: 'hidden'
        }}
      >
        {/* Top Search Input Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(0,0,0,0.2)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 38,
            height: 38,
            borderRadius: 10,
            background: 'rgba(99, 102, 241, 0.15)',
            color: 'var(--cyan)',
            flexShrink: 0
          }}>
            <Search size={20} />
          </div>

          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search across every drive (photos, videos, docs, folders)..."
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontSize: '1.05rem',
                fontWeight: 500,
                paddingRight: query ? 30 : 0
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                style={{
                  position: 'absolute',
                  right: 4,
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 22,
                  height: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-2)',
                  cursor: 'pointer'
                }}
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {loading && (
            <Loader2 size={18} className="spin" style={{ color: 'var(--cyan)', flexShrink: 0 }} />
          )}

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="btn btn-ghost"
            style={{
              padding: '7px 12px',
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: showAdvanced || activeFiltersCount > 0 ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              borderColor: activeFiltersCount > 0 ? 'var(--cyan)' : 'rgba(255,255,255,0.1)',
              color: activeFiltersCount > 0 ? 'var(--cyan)' : 'var(--text-2)'
            }}
            title="Toggle advanced filters"
          >
            <SlidersHorizontal size={14} />
            <span className="hide-mobile">Filters</span>
            {activeFiltersCount > 0 && (
              <span style={{
                background: 'var(--cyan)',
                color: '#000',
                borderRadius: 999,
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '1px 6px',
                lineHeight: 1
              }}>
                {activeFiltersCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-3)',
              cursor: 'pointer',
              padding: 6,
              display: 'flex',
              borderRadius: 6
            }}
            title="Close (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Filter Bar (Type pills + Drive selection) */}
        <div style={{
          padding: '12px 20px',
          background: 'rgba(255,255,255,0.02)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          {/* File Type Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-3)', fontWeight: 600, marginRight: 4, whiteSpace: 'nowrap' }}>
              Type:
            </span>
            {[
              { id: 'all', label: 'All Files' },
              { id: 'image', label: 'Photos', Icon: Img },
              { id: 'video', label: 'Videos', Icon: Film },
              { id: 'document', label: 'Documents', Icon: FileText },
              { id: 'archive', label: 'Archives', Icon: Archive },
              { id: 'folder', label: 'Folders', Icon: Folder },
            ].map(item => {
              const active = type === item.id;
              const Icon = item.Icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setType(item.id)}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 999,
                    border: active ? '1px solid var(--cyan)' : '1px solid rgba(255,255,255,0.08)',
                    background: active ? 'rgba(34, 211, 238, 0.15)' : 'rgba(255,255,255,0.03)',
                    color: active ? 'var(--cyan)' : 'var(--text-2)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {Icon && <Icon size={12} />}
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Advanced Controls Row */}
          {(showAdvanced || activeFiltersCount > 0) && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'center',
              paddingTop: 6,
              borderTop: '1px solid rgba(255,255,255,0.04)'
            }}>
              {/* Drive Filter Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <HardDrive size={13} color="var(--indigo)" />
                <select
                  className="custom-select custom-select-sm"
                  value={driveId}
                  onChange={(e) => setDriveId(e.target.value)}
                >
                  <option value="all">All Connected Drives ({drives.length})</option>
                  {drives.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.role ? `[${d.role}]` : ''} ({d.totalGB} GB)
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Filter Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={13} color="var(--amber)" />
                <select
                  className="custom-select custom-select-sm"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                >
                  {DATE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Size Filter Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileType size={13} color="var(--violet)" />
                <select
                  className="custom-select custom-select-sm"
                  value={sizeFilter}
                  onChange={(e) => setSizeFilter(e.target.value)}
                >
                  {SIZE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Sort By Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ArrowUpDown size={13} color="var(--emerald)" />
                <select
                  className="custom-select custom-select-sm"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  {SORT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>Sort: {opt.label}</option>
                  ))}
                </select>
              </div>

              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={resetFilters}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--rose)',
                    fontSize: '0.74rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                    padding: '4px 8px',
                    marginLeft: 'auto'
                  }}
                >
                  Reset Filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Results Counter / Disconnected Drive Warning */}
        <div style={{
          padding: '8px 20px',
          background: 'rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          color: 'var(--text-3)',
          borderBottom: '1px solid rgba(255,255,255,0.04)'
        }}>
          <div>
            {loading ? (
              <span>Searching drives…</span>
            ) : isDriveOffline ? (
              <span style={{ color: 'var(--rose)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                <AlertTriangle size={13} /> {offlineDriveName} is currently disconnected
              </span>
            ) : total > 0 ? (
              <span>
                Found <strong style={{ color: 'var(--cyan)' }}>{total}</strong> result{total !== 1 ? 's' : ''} across {driveId === 'all' ? `${drives.length} drives` : 'selected drive'}
              </span>
            ) : query.trim() || activeFiltersCount > 0 ? (
              <span>No matching items found</span>
            ) : (
              <span>Type keywords to search across Gallery, Master, Portable, Backup &amp; all drives</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.7rem' }}>
              Drives online: <strong style={{ color: 'var(--emerald)' }}>{drives.length}</strong>
            </span>
          </div>
        </div>

        {/* Results Scroll Area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 280,
          maxHeight: 'calc(80vh - 170px)'
        }}>
          {/* Offline Drive Message */}
          {isDriveOffline && (
            <div style={{
              margin: 'auto',
              textAlign: 'center',
              padding: '40px 20px',
              maxWidth: 420
            }}>
              <div style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'rgba(244, 63, 94, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <AlertTriangle size={30} color="var(--rose)" />
              </div>
              <h4 style={{ margin: '0 0 8px', color: '#fff', fontSize: '1.1rem' }}>
                Drive Disconnected
              </h4>
              <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-2)', lineHeight: 1.6 }}>
                <strong>{offlineDriveName}</strong> is not mounted or has been unplugged from the server.
                Please plug the drive back in to search its contents.
              </p>
            </div>
          )}

          {/* Empty Prompt */}
          {!loading && !isDriveOffline && results.length === 0 && (
            <div style={{
              margin: 'auto',
              textAlign: 'center',
              padding: '40px 20px',
              maxWidth: 440,
              color: 'var(--text-3)'
            }}>
              {query.trim() || activeFiltersCount > 0 ? (
                <>
                  <div style={{
                    width: 54,
                    height: 54,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.03)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 14px'
                  }}>
                    <Search size={24} style={{ opacity: 0.5 }} />
                  </div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>
                    No matching files found
                  </div>
                  <div style={{ fontSize: '0.8rem', lineHeight: 1.5 }}>
                    Try searching with fewer filters, different keywords, or switch to All Drives.
                  </div>
                </>
              ) : (
                <>
                  <div style={{
                    width: 54,
                    height: 54,
                    borderRadius: '50%',
                    background: 'rgba(99, 102, 241, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 14px'
                  }}>
                    <Sparkles size={24} color="var(--indigo)" />
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>
                    Unified Multi-Drive Search
                  </div>
                  <div style={{ fontSize: '0.82rem', lineHeight: 1.6 }}>
                    Instantly find files across <strong>Gallery</strong>, <strong>Supra1 / Master</strong>, <strong>GhostVault</strong>, <strong>Portable</strong>, and <strong>Backup</strong> drives. Photos with GPS metadata will display exact geographic map links.
                  </div>
                </>
              )}
            </div>
          )}

          {/* Result Items */}
          {results.map((item) => {
            const typeConfig = TYPE_ICONS[item.type] || TYPE_ICONS.document;
            const ItemIcon = typeConfig.Icon;
            const driveBadgeColor = ROLE_COLORS[item.driveRole] || 'var(--indigo)';

            return (
              <div
                key={item.id}
                onClick={() => {
                  if (item.isDir) {
                    onNavigateToFolder(item.driveId, item.path);
                    onClose();
                  } else {
                    onPreviewFile(item);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '12px 14px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(99, 102, 241, 0.08)';
                  e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.25)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                }}
              >
                {/* File Icon */}
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 8,
                  background: 'rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <ItemIcon size={20} color={typeConfig.color} />
                </div>

                {/* Content Column */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 4,
                    flexWrap: 'wrap'
                  }}>
                    {/* Filename */}
                    <span style={{
                      fontWeight: 600,
                      fontSize: '0.88rem',
                      color: 'var(--text-1)',
                      wordBreak: 'break-all'
                    }}>
                      {item.name}
                    </span>

                    {/* Drive Badge */}
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: driveBadgeColor,
                      color: '#fff',
                      lineHeight: 1.2,
                      letterSpacing: '0.02em',
                      whiteSpace: 'nowrap'
                    }}>
                      {item.driveName} {item.driveRole ? `· ${item.driveRole}` : ''}
                    </span>
                  </div>

                  {/* Dual Location & Metadata Row */}
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 12,
                    fontSize: '0.74rem',
                    color: 'var(--text-3)'
                  }}>
                    {/* Storage Location: Path */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
                      <Folder size={12} color="var(--amber)" style={{ flexShrink: 0 }} />
                      <span style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--text-2)'
                      }}>
                        {item.folder === '/' ? '/ (Root)' : item.folder}
                      </span>
                    </div>

                    {/* Geographic Location: GPS Metadata (Only if present!) */}
                    {item.gps && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        background: 'rgba(34, 211, 238, 0.1)',
                        padding: '2px 8px',
                        borderRadius: 4,
                        border: '1px solid rgba(34, 211, 238, 0.25)',
                        color: 'var(--cyan)'
                      }}>
                        <MapPin size={11} />
                        <span style={{ fontWeight: 600, fontSize: '0.72rem' }}>
                          {item.gps.coords}
                        </span>
                        <a
                          href={item.gps.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            color: '#fff',
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '1px 5px',
                            background: 'rgba(255,255,255,0.15)',
                            borderRadius: 3
                          }}
                          title="Open coordinates in Google Maps"
                        >
                          Map <ExternalLink size={10} />
                        </a>
                      </div>
                    )}

                    {/* File Size & Date */}
                    <span>{item.size}</span>
                    <span>·</span>
                    <span>{item.modified}</span>
                  </div>
                </div>

                {/* Right Action: Open Folder Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateToFolder(item.driveId, item.folder, item.name);
                      onClose();
                    }}
                    className="btn btn-ghost"
                    style={{
                      padding: '6px 10px',
                      fontSize: '0.74rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      background: 'rgba(255,255,255,0.04)',
                      borderColor: 'rgba(255,255,255,0.1)',
                      color: 'var(--text-2)',
                      borderRadius: 6
                    }}
                    title="Jump to containing folder in File Explorer"
                  >
                    <FolderOpen size={13} color="var(--amber)" />
                    <span className="hide-mobile">Open Folder</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div style={{
          padding: '10px 20px',
          background: 'rgba(0,0,0,0.3)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.72rem',
          color: 'var(--text-3)'
        }}>
          <div style={{ display: 'flex', gap: 14 }}>
            <span><kbd style={{ padding: '1px 5px', background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>Esc</kbd> Close</span>
            <span className="hide-mobile">Click any file to preview, or click "Open Folder" to jump to its location</span>
          </div>
          <div>
            <span>HC Dave Multi-Drive Search</span>
          </div>
        </div>
      </div>
    </div>
  );
}
