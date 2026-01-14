/**
 * Dropbox API Helper with Auto Token Refresh
 * Handles token refresh automatically when access token expires
 */

let cachedAccessToken = null;
let tokenExpiresAt = null;

/**
 * Get a valid access token, refreshing if necessary
 */
async function getAccessToken() {
  // Check if we have a valid cached token
  if (cachedAccessToken && tokenExpiresAt && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }
  
  // If using a static token (legacy support)
  if (process.env.DROPBOX_ACCESS_TOKEN && !process.env.DROPBOX_REFRESH_TOKEN) {
    return process.env.DROPBOX_ACCESS_TOKEN;
  }
  
  // Refresh the token
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
  const appKey = process.env.DROPBOX_APP_KEY;
  const appSecret = process.env.DROPBOX_APP_SECRET;
  
  if (!refreshToken || !appKey || !appSecret) {
    console.error('Missing Dropbox credentials for token refresh');
    return process.env.DROPBOX_ACCESS_TOKEN; // Fallback to static token
  }
  
  try {
    const response = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: appKey,
        client_secret: appSecret,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Token refresh failed:', error);
      return process.env.DROPBOX_ACCESS_TOKEN; // Fallback
    }
    
    const data = await response.json();
    cachedAccessToken = data.access_token;
    // Set expiry to 3.5 hours (tokens last 4 hours, refresh early)
    tokenExpiresAt = Date.now() + (3.5 * 60 * 60 * 1000);
    
    console.log('Dropbox token refreshed successfully');
    return cachedAccessToken;
  } catch (error) {
    console.error('Error refreshing Dropbox token:', error);
    return process.env.DROPBOX_ACCESS_TOKEN; // Fallback
  }
}

/**
 * Create a folder in Dropbox
 */
async function createFolder(folderPath) {
  const token = await getAccessToken();
  
  try {
    const response = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: folderPath,
        autorename: false,
      }),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      if (result.error && result.error['.tag'] === 'path' && 
          result.error.path['.tag'] === 'conflict') {
        console.log('Folder already exists, continuing...');
        return { success: true, path: folderPath };
      }
      throw new Error(result.error_summary || 'Failed to create folder');
    }
    
    return { success: true, path: folderPath };
  } catch (error) {
    console.error('Error creating Dropbox folder:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create a shared link for a folder
 */
async function createSharedLink(folderPath) {
  const token = await getAccessToken();
  
  try {
    const response = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: folderPath,
        settings: {
          requested_visibility: 'public',
          audience: 'public',
          access: 'viewer',
        },
      }),
    });
    
    const result = await response.json();
    
    if (response.ok) {
      return { success: true, url: result.url };
    }
    
    if (result.error && result.error['.tag'] === 'shared_link_already_exists') {
      return await getExistingSharedLink(folderPath);
    }
    
    throw new Error(result.error_summary || 'Failed to create shared link');
  } catch (error) {
    console.error('Error creating shared link:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get existing shared link for a path
 */
async function getExistingSharedLink(path) {
  const token = await getAccessToken();
  
  try {
    const response = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: path,
        direct_only: true,
      }),
    });
    
    const result = await response.json();
    
    if (result.links && result.links.length > 0) {
      return { success: true, url: result.links[0].url };
    }
    
    return { success: false, error: 'No shared link found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Upload a file to Dropbox
 */
async function uploadFile(fileBuffer, filePath) {
  const token = await getAccessToken();
  
  try {
    const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
          path: filePath,
          mode: 'add',
          autorename: true,
        }),
      },
      body: fileBuffer,
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error uploading file:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a folder
 */
async function deleteFolder(folderPath) {
  const token = await getAccessToken();
  
  try {
    const response = await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: folderPath,
      }),
    });
    
    if (response.ok) {
      return { success: true };
    }
    
    const result = await response.json();
    
    if (result.error && result.error['.tag'] === 'path_lookup') {
      return { success: true, message: 'Folder not found' };
    }
    
    return { success: false, error: result.error_summary };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Convert shared link to direct download link
 */
function getDirectDownloadLink(sharedLink) {
  if (!sharedLink) return '';
  
  if (sharedLink.includes('?dl=0')) {
    return sharedLink.replace('?dl=0', '?dl=1');
  } else if (sharedLink.includes('&dl=0')) {
    return sharedLink.replace('&dl=0', '&dl=1');
  } else if (!sharedLink.includes('dl=1')) {
    return sharedLink + (sharedLink.includes('?') ? '&dl=1' : '?dl=1');
  }
  
  return sharedLink;
}

module.exports = {
  getAccessToken,
  createFolder,
  createSharedLink,
  getExistingSharedLink,
  uploadFile,
  deleteFolder,
  getDirectDownloadLink,
};
