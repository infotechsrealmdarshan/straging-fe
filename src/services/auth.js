import axios from 'axios';

const API_BASE = process.env.REACT_APP_BASE_URL + '/api';

export const authService = {
  register: async (userData) => {
    const response = await axios.post(`${API_BASE}/users/register`, userData);
    return response.data;
  },

  login: async (credentials) => {
    const response = await axios.post(`${API_BASE}/users/login`, credentials);
    return response.data;
  },

  setAuthData: (accessToken, user) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('user', JSON.stringify(user));
    console.log('Token stored in localStorage:', accessToken);
    console.log('User data stored:', user);
  },

  getAuthData: () => {
    const token = localStorage.getItem('accessToken');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return { token, user };
  },

  clearAuthData: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
  },

  isAuthenticated: () => {
    const { token } = authService.getAuthData();
    return !!token;
  }
};
