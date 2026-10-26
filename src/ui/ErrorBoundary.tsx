/**
 * Error boundaries so one failing part (e.g. no WebGL, a render bug in a modal)
 * doesn't unmount the whole React tree and leave a blank page.
 */
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  /** shown in the console so reports say which part failed */
  name: string;
  fallback: (error: Error, reset: () => void) => ReactNode;
  /** when this value changes, a failed boundary resets and tries again */
  resetKey?: unknown;
  children: ReactNode;
}
interface State { error: Error | null; key: unknown }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { key: props.resetKey, error: null } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[KitFlow] ${this.props.name} crashed`, error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children;
  }
}

/** Full-screen last resort: the app itself failed to render. */
export function CrashScreen({ error }: { error: Error }) {
  return (
    <div className="overlay" role="alert">
      <div className="dialog">
        <div className="hd">
          <h2>Something went wrong</h2>
          <p>KitFlow hit an unexpected error. Reloading usually fixes it; your best scores are kept.</p>
        </div>
        <div className="bd">
          <p className="sub mono" style={{ marginBottom: 12, wordBreak: 'break-word' }}>{error.message}</p>
          <button className="btn pri" style={{ width: '100%', padding: 12 }} onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    </div>
  );
}

/** In place of the 3D yard when it can't render (most often: WebGL unavailable). */
export function SceneFallback() {
  return (
    <div className="scene" role="status" style={{ display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <p className="sub" style={{ maxWidth: 360 }}>
        The 3D yard view couldn't start on this device (WebGL may be disabled). You can keep playing from the panels.
      </p>
    </div>
  );
}

/** For a modal that crashed: say so and let the player close it. */
export function ModalFallback({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="overlay" role="alert">
      <div className="dialog">
        <div className="hd">
          <h2>{title} couldn't open</h2>
          <p>Something went wrong showing this view. Close it to get back to the shift.</p>
        </div>
        <div className="bd">
          <button className="btn pri" style={{ width: '100%', padding: 12 }} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
