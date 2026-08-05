import React, { useState, useEffect } from 'react';
import { Sliders, Key, FileText, CheckCircle, HelpCircle, Eye, EyeOff, User, Mail } from 'lucide-react';

interface Page5Props {
  apiKey: string;
  onSaveApiKey: (newKey: string) => Promise<void>;
}

export const Page5DeveloperControls: React.FC<Page5Props> = ({
  apiKey,
  onSaveApiKey
}) => {
  const [keyInput, setKeyInput] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync state if prop changes
  useEffect(() => {
    setKeyInput(apiKey);
  }, [apiKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveApiKey(keyInput);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Welcome Banner */}
      <div className="card-panel" style={{ borderLeft: '4px solid var(--color-primary)', background: 'linear-gradient(90deg, #eff6ff 0%, #ffffff 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
          <Sliders size={12} />
          <span>System & Dev Tools</span>
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '4px', color: 'var(--text-primary)' }}>Developer Controls</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Configure API credentials, inspect system local configuration files, and check system status.
        </p>
      </div>

      <div className="panel-grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
        {/* API Credentials Card */}
        <div className="card-panel">
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Key size={18} style={{ color: 'var(--color-primary)' }} />
            <span>Groq API Key Credentials</span>
          </h3>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Groq API Key (gsk_...)
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  className="search-input-field"
                  placeholder="Enter your Groq API Key"
                  style={{ paddingRight: '40px', paddingLeft: '14px', background: '#ffffff' }}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)'
                  }}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'stretch', justifyContent: 'space-between', gap: '12px', marginTop: '4px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {apiKey ? '✓ API Key is configured' : '✗ API Key is missing'}
              </span>
              <button
                type="submit"
                disabled={isSaving}
                className="btn btn-primary"
                style={{ padding: '8px 16px', fontSize: '0.8rem' }}
              >
                {isSaving ? 'Saving...' : 'Save API Key'}
              </button>
            </div>
          </form>

          {saveSuccess && (
            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-success)', fontSize: '0.75rem', fontWeight: 600 }}>
              <CheckCircle size={14} /> Key saved successfully to groq_config.json!
            </div>
          )}
        </div>

        {/* Local Storage System Path Card */}
        <div className="card-panel">
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <FileText size={18} style={{ color: 'var(--color-purple)' }} />
            <span>Local Configuration File Path</span>
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                Absolute Local Path:
              </span>
              <div
                className="font-mono"
                style={{
                  fontSize: '0.75rem',
                  backgroundColor: '#f8fafc',
                  border: '1px solid var(--border-light)',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  wordBreak: 'break-all',
                  userSelect: 'all',
                  color: 'var(--text-primary)',
                  fontWeight: 600
                }}
              >
                c:\Users\Meeket Tank\Desktop\Mutual Fund\groq_config.json
              </div>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'start' }}>
                <HelpCircle size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '2px' }} />
                <span>
                  The API Key and generated analysis summaries are persisted in this local JSON file in the root of your workspace directory. This allows safe and clean storage on your filesystem.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Developer Info Card */}
        <div className="card-panel">
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <User size={18} style={{ color: 'var(--color-success)' }} />
            <span>Developer Information</span>
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                System Author:
              </span>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Developed by Meeket Tank
              </div>
            </div>

            <div>
              <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
                Contact & Support:
              </span>
              <a
                href="mailto:meeketketantank@gmail.com?subject=Mail%20regarding%20MFD%20Web%20System"
                className="btn btn-outline"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  textDecoration: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: 'var(--color-success)',
                  borderColor: 'var(--color-success)',
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'transparent',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = 'var(--color-success)';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--color-success)';
                }}
              >
                <Mail size={14} />
                <span>Email Developer</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
