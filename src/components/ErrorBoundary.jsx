import React from 'react';

/**
 * Catches render-time errors from a page so a single broken component shows a
 * readable message instead of a white screen. The sidebar keeps working, so the
 * user can navigate away; "重試" clears the error and re-renders the page.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log locally for diagnostics; the app has no remote error reporting.
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Navigating to a different page gives the new page a clean slate.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    const message = this.state.error?.message || String(this.state.error);
    return (
      <div className="error-boundary" role="alert">
        <div className="error-boundary-card">
          <h2>頁面載入時發生錯誤</h2>
          <p>這個頁面暫時無法顯示。你可以重試，或先切換到其他頁面。</p>
          <pre className="error-boundary-detail">{message}</pre>
          <div className="error-boundary-actions">
            <button type="button" onClick={() => this.setState({ error: null })}>
              重試
            </button>
            <button type="button" onClick={() => window.location.reload()}>
              重新載入 App
            </button>
          </div>
        </div>
      </div>
    );
  }
}
