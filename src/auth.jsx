import React, { createContext, useContext, useEffect, useState } from 'react';
import * as api from './api';

/*
  Session for the two roles:
    uploader -> uploads / replaces / removes Excel files (and can view dashboards)
    admin    -> view-only dashboards of what the uploader has saved
*/

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => api.getSession()?.user || null);
  const [checking, setChecking] = useState(() => !!api.getSession()?.token);

  const logout = () => { api.saveSession(null); setUser(null); };

  useEffect(() => {
    api.setUnauthorizedHandler(logout);
    if (!api.getSession()?.token) return;
    api.me()
      .then((d) => { setUser(d.user); api.saveSession({ ...api.getSession(), user: d.user }); })
      .catch(() => logout())
      .finally(() => setChecking(false));
  }, []);

  const login = async (username, password) => {
    const { token, user: u } = await api.login(username, password);
    api.saveSession({ token, user: u });
    setUser(u);
    return u;
  };

  const value = {
    user,
    checking,
    login,
    logout,
    isUploader: user?.role === 'uploader',
    isAdmin: user?.role === 'admin',
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);