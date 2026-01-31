import axios from 'axios';

const API_BASE = process.env.REACT_APP_BASE_URL + '/api';

export const stragingService = {
  // Public - Get all projects
  publicGetAll: async (page = 1, limit = 10, search = "") => {
    const response = await axios.get(`${API_BASE}/straging`, {
      params: { page, limit, search }
    });
    return response.data;
  },

  // Public - Get specific straging by ID
  getPublicStragingById: async (stragingId) => {
    const response = await axios.get(`${API_BASE}/straging/public/${stragingId}`);
    return response.data;
  },

  // User - Create straging
  uploadStraging: async (formData, token) => {
    const response = await axios.post(`${API_BASE}/straging`, formData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },

  // User - Create straging with JSON (for images already uploaded)
  createStraging: async (projectData, token) => {
    const response = await axios.post(`${API_BASE}/straging`, projectData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  },

  // User - Get my stragings
  getMyStragings: async (token, page = 1, limit = 10, search = "") => {
    const response = await axios.get(`${API_BASE}/straging/user`, {
      params: { page, limit, search },
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data;
  },

  // User - Get specific straging by ID
  getStragingById: async (stragingId, token) => {
    // Directly use the user endpoint since detail endpoint is deprecated/removed
    const response = await axios.get(`${API_BASE}/straging/user/${stragingId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data;
  },

  // User - Update straging
  updateStraging: async (stragingId, updateData, token) => {
    const response = await axios.put(`${API_BASE}/straging/user/${stragingId}`, updateData, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data;
  },

  // User - Delete straging
  deleteStraging: async (stragingId, token) => {
    const response = await axios.delete(`${API_BASE}/straging/${stragingId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data;
  },

  // Image upload with hotspot and info
  uploadImageWithHotspotAndInfo: async (formData, token) => {
    const response = await axios.post(`${API_BASE}/straging/upload-with-hotspot-info`, formData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },

  // Add hotspot and info to existing image
  addHotspotAndInfoToImage: async (stragingId, imageIndex, hotspotInfoData, token) => {
    const response = await axios.put(`${API_BASE}/straging/${stragingId}/images/${imageIndex}/hotspot-info`, hotspotInfoData, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data;
  },

  // Add info to specific area
  addInfoToArea: async (stragingId, areaId, infoData, token) => {
    const response = await axios.post(`${API_BASE}/straging/${stragingId}/areas/${areaId}/info`, infoData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  },

  // Add hotspot to specific area (with createArea option)
  addHotspotToArea: async (stragingId, areaId, hotspotData, token) => {
    const formData = new FormData();
    formData.append('title', hotspotData.title);
    formData.append('x', hotspotData.x);
    formData.append('y', hotspotData.y);
    if (hotspotData.description) {
      formData.append('description', hotspotData.description);
    }
    if (hotspotData.image) {
      formData.append('image', hotspotData.image);
    }
    if (hotspotData.createArea !== undefined) {
      formData.append('createArea', hotspotData.createArea);
    }

    const response = await axios.post(`${API_BASE}/straging/${stragingId}/areas/${areaId}/hotspots`, formData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },

  // Get info entries for straging project
  getInfo: async (stragingId, token) => {
    const response = await axios.get(`${API_BASE}/straging/user/${stragingId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data;
  },

  // Add hotspot only with image
  addHotspotOnly: async (stragingId, hotspotData, token) => {
    const formData = new FormData();
    formData.append('x', hotspotData.x);
    formData.append('y', hotspotData.y);
    formData.append('title', hotspotData.title);
    if (hotspotData.description) {
      formData.append('description', hotspotData.description);
    }
    if (hotspotData.image) {
      formData.append('image', hotspotData.image);
    }
    if (hotspotData.areaId) {
      formData.append('areaId', hotspotData.areaId);
    }

    const response = await axios.post(`${API_BASE}/straging/${stragingId}/hotspot`, formData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },

  // Add area with image
  addArea: async (stragingId, areaData, token) => {
    const formData = new FormData();
    formData.append('areaName', areaData.areaName);
    if (areaData.image) {
      formData.append('image', areaData.image);
    }

    const response = await axios.post(`${API_BASE}/straging/${stragingId}/areas`, formData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },

  // Delete area and hotspot together
  deleteAreaAndHotspot: async (stragingId, deleteData, token) => {
    const response = await axios.delete(`${API_BASE}/straging/${stragingId}/delete-area-hotspot`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: deleteData
    });
    return response.data;
  },

  // Add item to project library
  addItemToLibrary: async (stragingId, imageData, token, width = null, height = null) => {
    const formData = new FormData();
    formData.append('image', imageData);
    if (width) formData.append('width', width);
    if (height) formData.append('height', height);

    const response = await axios.post(`${API_BASE}/straging/${stragingId}/items`, formData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },

  // Place library item in area
  placeItemInArea: async (stragingId, areaId, placementData, token) => {
    const response = await axios.post(`${API_BASE}/straging/${stragingId}/areas/${areaId}/items`, placementData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  },

  // Global delete item (from library and all areas)
  deleteItemFromLibrary: async (stragingId, itemId, token) => {
    const response = await axios.delete(`${API_BASE}/straging/${stragingId}/items/${itemId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data;
  },

  // Specific delete item instance from area
  deleteItemInstance: async (stragingId, areaId, instanceId, token) => {
    const response = await axios.delete(`${API_BASE}/straging/${stragingId}/areas/${areaId}/items/${instanceId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data;
  },

  // Update item instance in area
  updateItemInstance: async (stragingId, areaId, instanceId, updateData, token) => {
    const response = await axios.put(`${API_BASE}/straging/${stragingId}/areas/${areaId}/items/${instanceId}`, updateData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  }
};
