import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'PREMIUM';
  profile: {
    firstName?: string;
    lastName?: string;
    avatar?: string;
    timezone: string;
    language: string;
    country?: string;
    phone?: string;
  };
  settings: {
    defaultBalance: number;
    defaultSkipCandles: number;
    defaultAnalysisWindow: number;
    emailNotifications: boolean;
    darkMode: boolean;
    autoSavePrompts: boolean;
    maxConcurrentBacktests: number;
    preferredCurrency: string;
  };
  createdAt: string;
  lastLogin?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface RegisterResponse {
  user: User;
  token: string;
}

class AuthService {
  private api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  constructor() {
    // Add request interceptor to include auth token
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor to handle auth errors
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  async login(email: string, password: string): Promise<ApiResponse<LoginResponse>> {
    try {
      const response = await this.api.post('/auth/login', {
        email,
        password,
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Login failed',
      };
    }
  }

  async register(
    username: string,
    email: string,
    password: string,
    role: string = 'USER'
  ): Promise<ApiResponse<RegisterResponse>> {
    try {
      const response = await this.api.post('/auth/register', {
        username,
        email,
        password,
        role,
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Registration failed',
      };
    }
  }

  async verifyToken(): Promise<User | null> {
    try {
      const response = await this.api.get('/auth/verify');
      if (response.data.success) {
        return response.data.data.user;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async getProfile(): Promise<ApiResponse<{ user: User }>> {
    try {
      const response = await this.api.get('/auth/profile');
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to get profile',
      };
    }
  }

  async updateProfile(profileData: any): Promise<ApiResponse<{ user: User }>> {
    try {
      const response = await this.api.put('/auth/profile', profileData);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to update profile',
      };
    }
  }

  async updateSettings(settingsData: any): Promise<ApiResponse<{ settings: any }>> {
    try {
      const response = await this.api.put('/auth/settings', settingsData);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to update settings',
      };
    }
  }

  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<ApiResponse> {
    try {
      const response = await this.api.put('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to change password',
      };
    }
  }

  async logout(): Promise<void> {
    try {
      await this.api.post('/auth/logout');
    } catch (error) {
      // Ignore logout errors
    } finally {
      localStorage.removeItem('token');
    }
  }

  async getPermissions(): Promise<ApiResponse<{ role: string; permissions: string[] }>> {
    try {
      const response = await this.api.get('/auth/permissions');
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to get permissions',
      };
    }
  }

  async getAllUsers(): Promise<ApiResponse<{ users: User[]; total: number }>> {
    try {
      const response = await this.api.get('/auth/users');
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to get users',
      };
    }
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem('token');
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  setToken(token: string): void {
    localStorage.setItem('token', token);
  }

  removeToken(): void {
    localStorage.removeItem('token');
  }
}

export const authService = new AuthService();
export default authService;
