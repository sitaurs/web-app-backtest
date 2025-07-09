import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authService, User } from '../services/authService';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  updateProfile: (profileData: any) => Promise<boolean>;
  updateSettings: (settingsData: any) => Promise<boolean>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const userData = await authService.verifyToken();
        if (userData) {
          setUser(userData);
        } else {
          localStorage.removeItem('token');
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setLoading(true);
      const response = await authService.login(email, password);
      
      if (response.success) {
        setUser(response.data.user);
        localStorage.setItem('token', response.data.token);
        toast.success('Login successful!');
        return true;
      } else {
        toast.error(response.error || 'Login failed');
        return false;
      }
    } catch (error: any) {
      toast.error(error.message || 'Login failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const register = async (username: string, email: string, password: string): Promise<boolean> => {
    try {
      setLoading(true);
      const response = await authService.register(username, email, password);
      
      if (response.success) {
        setUser(response.data.user);
        localStorage.setItem('token', response.data.token);
        toast.success('Registration successful!');
        return true;
      } else {
        toast.error(response.error || 'Registration failed');
        return false;
      }
    } catch (error: any) {
      toast.error(error.message || 'Registration failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('token');
    toast.success('Logged out successfully');
  };

  const updateProfile = async (profileData: any): Promise<boolean> => {
    try {
      const response = await authService.updateProfile(profileData);
      
      if (response.success) {
        setUser(response.data.user);
        toast.success('Profile updated successfully');
        return true;
      } else {
        toast.error(response.error || 'Profile update failed');
        return false;
      }
    } catch (error: any) {
      toast.error(error.message || 'Profile update failed');
      return false;
    }
  };

  const updateSettings = async (settingsData: any): Promise<boolean> => {
    try {
      const response = await authService.updateSettings(settingsData);
      
      if (response.success) {
        // Update user settings in context
        if (user) {
          setUser({
            ...user,
            settings: response.data.settings
          });
        }
        toast.success('Settings updated successfully');
        return true;
      } else {
        toast.error(response.error || 'Settings update failed');
        return false;
      }
    } catch (error: any) {
      toast.error(error.message || 'Settings update failed');
      return false;
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    updateProfile,
    updateSettings,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
