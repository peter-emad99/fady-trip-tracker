import { Component } from 'react';
import { Button } from '@/components/ui/button';

// Catches a page that fails to load or render, instead of leaving a blank screen. The usual cause
// is a page's code not downloading: offline before it was ever cached, or right after a new deploy.
export default class PageErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('Page failed to load', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const offline = !navigator.onLine;
    return (
      <div className="py-12 text-center">
        <h2 className="text-lg font-medium text-slate-900">
          {offline ? "This page isn't available offline yet" : "Something went wrong loading this page"}
        </h2>
        <p className="mt-1 text-slate-500">
          {offline ? 'Open it once while online and it will work offline after that.' : 'Reloading usually fixes it.'}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }
}
