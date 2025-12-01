
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

const App: React.FC = () => {
  return (
    <AuthGuard>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/images" element={<ImageWorkshopList />} />
            <Route path="/inspiration" element={<InspirationRepo />} />
            <Route path="/project/:id" element={<ProjectWorkspace />} />
            <Route path="/project/:id/images" element={<StoryboardImages />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </HashRouter>
    </AuthGuard>
  );
};

export default App;
