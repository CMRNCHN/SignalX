/**
 * Link Account Modal
 * Guide users through linking their Signal device
 */

import { useState } from 'react';
import { invoke } from '../utils/tauri';
import { Button } from './primitives/Button';

interface LinkAccountModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function LinkAccountModal({ open, onClose, onSuccess }: LinkAccountModalProps) {
  const [step, setStep] = useState<'phone' | 'qr' | 'verifying' | 'done'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  console.log('LinkAccountModal render - open:', open, 'step:', step);

  if (!open) {
    console.log('LinkAccountModal: Not rendering (open=false)');
    return null;
  }

  console.log('LinkAccountModal: Rendering modal');

  const handleStartLink = async () => {
    if (!phoneNumber.trim()) {
      setError('Please enter your phone number');
      return;
    }

    // For now, show manual instructions
    setStep('qr');
  };

  const handleClose = () => {
    setStep('phone');
    setPhoneNumber('');
    setQrCode('');
    setError('');
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000, // Higher than WelcomeOverlay (999)
        padding: 20,
      }}
      onClick={(e) => {
        // Only close if clicking the backdrop, not the modal content
        if (e.target === e.currentTarget) {
          console.log('LinkAccountModal: Closing via backdrop click');
          handleClose();
        }
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          borderRadius: 16,
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
          maxWidth: 500,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 32,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Header */}
          <div>
            <h2
              style={{
                fontSize: 24,
                fontWeight: 700,
                margin: 0,
                marginBottom: 8,
                color: '#f1f5f9',
              }}
            >
              {step === 'phone' && '📱 Link Your Signal Account'}
              {step === 'qr' && '📷 Scan QR Code'}
              {step === 'verifying' && '⏳ Verifying...'}
              {step === 'done' && '✅ Account Linked!'}
            </h2>
            <p style={{ margin: 0, color: '#cbd5e1', fontSize: 14 }}>
              {step === 'phone' && 'Enter your phone number to get started'}
              {step === 'qr' && 'Scan this QR code from your Signal mobile app'}
              {step === 'verifying' && 'Please wait while we verify your device'}
              {step === 'done' && 'Your account has been successfully linked'}
            </p>
          </div>

          {/* Content */}
          <div>
            {step === 'phone' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: 8,
                      fontSize: 14,
                      fontWeight: 500,
                      color: '#e2e8f0',
                    }}
                  >
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+1234567890"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: 8,
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      background: 'rgba(15, 23, 42, 0.6)',
                      color: '#f1f5f9',
                      fontSize: 16,
                      outline: 'none',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#0ea5e9';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(148, 163, 184, 0.2)';
                    }}
                  />
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: '#94a3b8' }}>
                    Include country code (e.g., +1 for USA)
                  </p>
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                  }}
                >
                  <p style={{ margin: 0, fontSize: 13, color: '#93c5fd', lineHeight: 1.6 }}>
                    <strong>Note:</strong> This requires signal-cli to be installed and configured.
                    The linking process will generate a QR code that you'll scan from your Signal mobile app.
                  </p>
                </div>

                {error && (
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#fca5a5',
                      fontSize: 14,
                    }}
                  >
                    {error}
                  </div>
                )}
              </div>
            )}

            {step === 'qr' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                  }}
                >
                  <p style={{ margin: '0 0 12px', fontSize: 14, color: '#93c5fd', fontWeight: 600 }}>
                    📋 Manual Setup Instructions
                  </p>
                  <ol
                    style={{
                      margin: 0,
                      padding: '0 0 0 20px',
                      fontSize: 13,
                      color: '#93c5fd',
                      lineHeight: 1.8,
                    }}
                  >
                    <li>
                      <strong>Install signal-cli:</strong>
                      <pre
                        style={{
                          marginTop: 8,
                          padding: '8px 12px',
                          background: 'rgba(15, 23, 42, 0.6)',
                          borderRadius: 6,
                          fontSize: 12,
                          overflow: 'auto',
                        }}
                      >
                        brew install signal-cli
                      </pre>
                    </li>
                    <li style={{ marginTop: 12 }}>
                      <strong>Link your device (with phone number: {phoneNumber}):</strong>
                      <pre
                        style={{
                          marginTop: 8,
                          padding: '8px 12px',
                          background: 'rgba(15, 23, 42, 0.6)',
                          borderRadius: 6,
                          fontSize: 12,
                          overflow: 'auto',
                        }}
                      >
                        signal-cli -a {phoneNumber} link -n "SignalX"
                      </pre>
                    </li>
                    <li style={{ marginTop: 12 }}>
                      <strong>Scan the QR code</strong> that appears in your terminal using your Signal mobile app
                      (Settings → Linked devices → + icon)
                    </li>
                    <li style={{ marginTop: 12 }}>
                      <strong>Set your number</strong> in the environment:
                      <pre
                        style={{
                          marginTop: 8,
                          padding: '8px 12px',
                          background: 'rgba(15, 23, 42, 0.6)',
                          borderRadius: 6,
                          fontSize: 12,
                          overflow: 'auto',
                        }}
                      >
                        echo "SIGNALX_NUMBER={phoneNumber}" &gt;&gt; .signalx.env
                      </pre>
                    </li>
                    <li style={{ marginTop: 12 }}>
                      <strong>Restart the app</strong> - Your account will appear in the welcome screen!
                    </li>
                  </ol>
                </div>

                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    background: 'rgba(234, 179, 8, 0.1)',
                    border: '1px solid rgba(234, 179, 8, 0.2)',
                  }}
                >
                  <p style={{ margin: 0, fontSize: 12, color: '#fde047', lineHeight: 1.6 }}>
                    💡 <strong>Tip:</strong> You can also add the SIGNALX_NUMBER to your <code>.signalx.env</code> file
                    in the project root directory for automatic account detection.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <Button onClick={handleClose} variant="secondary" size="md">
              {step === 'done' ? 'Close' : 'Cancel'}
            </Button>
            {step === 'phone' && (
              <Button
                onClick={handleStartLink}
                variant="primary"
                size="md"
                disabled={loading || !phoneNumber.trim()}
                style={{
                  background: 'linear-gradient(135deg, #0ea5e9, #22d3ee)',
                  boxShadow: '0 10px 30px rgba(14,165,233,0.35)',
                }}
              >
                {loading ? 'Starting...' : 'Continue'}
              </Button>
            )}
            {step === 'done' && (
              <Button
                onClick={() => {
                  handleClose();
                  onSuccess?.();
                }}
                variant="primary"
                size="md"
              >
                Done
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
