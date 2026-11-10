import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('Dashboard Error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f0f4f8', padding: 24, flexDirection: 'column', gap: 16
        }}>
          <h2 style={{ color: '#dc2626' }}>Something went wrong</h2>
          <pre style={{
            background: '#fef2f2', padding: 16, borderRadius: 8, maxWidth: 600,
            overflow: 'auto', fontSize: 13, color: '#991b1b'
          }}>
            {this.state.error?.message || 'Unknown error'}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px', background: '#0d9488', color: 'white',
              border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer'
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}