import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50 text-slate-800 p-8">
            <div className="max-w-md text-center bg-white p-10 rounded-3xl shadow-xl border border-slate-100">
                <h1 className="text-3xl font-extrabold text-rose-500 mb-4">应用遇到错误</h1>
                <p className="text-slate-500 mb-6 font-medium">抱歉，发生了一个意外错误，导致页面无法渲染。</p>
                <div className="bg-slate-50 p-4 rounded-xl text-left overflow-auto max-h-40 mb-6 border border-slate-200">
                    <code className="text-xs font-mono text-slate-600">{this.state.error?.message}</code>
                </div>
                <button 
                    onClick={() => window.location.reload()}
                    className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors"
                >
                    重新加载页面
                </button>
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
  </React.StrictMode>
);
