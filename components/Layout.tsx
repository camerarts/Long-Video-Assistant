import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ProjectWorkspace from './pages/ProjectWorkspace';
import Settings from './pages/Settings';
import StoryboardImages from './pages/StoryboardImages';
import ImageWorkshopList from './pages/ImageWorkshopList';
import InspirationRepo from './pages/InspirationRepo';
import AuthGuard from './components/AuthGuard';
import LandingPage from './pages/LandingPage';
import CreateProject from './pages/CreateProject';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => (
  <AuthGuard>
    <Layout>{children}</Layout>
  </AuthGuard>
);

const App: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/create" element={<ProtectedRoute><CreateProject /></ProtectedRoute>} />
        <Route path="/images" element={<ProtectedRoute><ImageWorkshopList /></ProtectedRoute>} />
        <Route path="/inspiration" element={<ProtectedRoute><InspirationRepo /></ProtectedRoute>} />
        <Route path="/project/:id" element={<ProtectedRoute><ProjectWorkspace /></ProtectedRoute>} />
        <Route path="/project/:id/images" element={<ProtectedRoute><StoryboardImages /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
