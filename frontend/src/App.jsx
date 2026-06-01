import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { api } from './api/client';
import Login from './pages/Login';
import Anonymizer from './pages/Anonymizer';
import History from './pages/History';
import Admin from './pages/Admin';
import Layout from './components/Layout';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [user, setUser]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/me')
      .then(data => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 text-gray-400">
        Chargement...
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={!user ? <Login /> : <Navigate to="/anonymizer" replace />} />
          <Route path="/" element={user ? <Layout /> : <Navigate to="/login" replace />}>
            <Route index element={<Navigate to="/anonymizer" replace />} />
            <Route path="anonymizer" element={<Anonymizer />} />
            <Route path="history"   element={<History />} />
            <Route
              path="admin"
              element={user?.role === 'admin' ? <Admin /> : <Navigate to="/anonymizer" replace />}
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
